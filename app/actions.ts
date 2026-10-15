"use server";
import { currentUser, createSession, destroySession } from '@/lib/session';
import { authenticate, register, throttle } from '@/lib/auth-service';
import { authRequestThrottle } from '@/app/auth-actions';
import { ownedQuery, transaction } from '@/lib/db';
import { availableModels, defaultModel, normalizeModel } from '@/lib/models';
import { generateResponse, aiConfiguration, type AIImage } from '@/lib/ai';
import { createBillingClient } from '@/lib/billing';
import { currentCustomer } from '@/lib/stripe-billing';
import { verifiedStripe } from '@/lib/stripe';
import { managedPlan } from '@/lib/subscription-catalog';
import { plans, priceLabel } from '@/lib/plans';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import { encodedRedirect } from '@/utils/redirect';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sendWelcomeEmail, sendLoginAlertEmail, emailConfigured } from '@/lib/email';
import { headers } from 'next/headers';

export async function signInAction(form:FormData) {
  const email = String(form.get('email') || '');
  try {
    await authRequestThrottle();
    const id = await authenticate(email, String(form.get('password') || ''));
    await createSession(id);
  } catch (error) {
    return encodedRedirect('error', '/sign-in', error instanceof Error ? error.message : 'Unable to sign in.');
  }
  try {
    if (emailConfigured() && email) {
      const h = await headers();
      const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
      const ua = h.get('user-agent') || 'unknown device';
      const deviceSummary = `${ip} · ${ua.slice(0, 120)}`;
      await sendLoginAlertEmail(email, { deviceSummary, actionUrl: '/account' });
    }
  } catch {
    /* Login alert is best-effort */
  }
  const next = String(form.get('next') || '');
  revalidatePath('/');
  redirect(/^\/(?:workspace|subscribe|software)(?:[/?]|$)/.test(next)&&!/[\\\r\n]/.test(next)?next:'/dashboard');
}
export async function signUpAction(form:FormData) {
  if(form.get('accept_terms')!=='on') return encodedRedirect('error','/sign-up','Please agree to the Terms & Conditions before creating an account.');
  let user:{id:string;email:string};
  try {
    await authRequestThrottle();
    user=await register(String(form.get('email')||''),String(form.get('password')||''));
    await createSession(user.id);
  }
  catch(error) { return encodedRedirect('error','/sign-up',error instanceof Error?error.message:'Unable to sign up.'); }
  try {
    if (emailConfigured()) {
      await sendWelcomeEmail(user.email, { actionUrl: '/dashboard' });
    }
  } catch {
    /* Welcome email is best-effort */
  }
  revalidatePath('/');
  redirect('/dashboard');
}
export async function signOutAction() { await destroySession(); redirect('/sign-in'); }
export async function getCurrentUserAction() { return currentUser(); }
export async function logoutAction() { await destroySession(); return {success:true}; }
export async function createCheckout(priceId:string) {
  if(!await currentUser()) redirect('/sign-in');
  const client=await createBillingClient();
  const result=await client.billing.createCheckoutSession(priceId);
  if(result.error || !result.data.url) throw new Error(result.error?.message || 'Unable to create checkout.');
  redirect(result.data.url);
}
// Server Action to get detailed subscription status
export async function getSubscriptionDetails(): Promise<{
  planName: string | null;
  planKey: string | null;
  subscriptionId: string | null;
  status: string | null;
  priceLabel: string | null;
  scheduledPlanKey: string | null;
  scheduledPlanName: string | null;
  scheduledPriceLabel: string | null;
  scheduledDate: string | null;
  canUpgrade: boolean;
  renewalDate: string | null;
  isCancelled: boolean;
  error?: string;
}> {
  const empty = {
    planName: null,
    planKey: null,
    subscriptionId: null,
    status: null,
    priceLabel: null,
    scheduledPlanKey: null,
    scheduledPlanName: null,
    scheduledPriceLabel: null,
    scheduledDate: null,
    canUpgrade: false,
    renewalDate: null,
    isCancelled: false,
  };
  try {
    const user = await currentUser();
    if (!user) return { ...empty, error: 'Please sign in to view your plan.' };
    const customerId = await currentCustomer();
    if (!customerId) return empty;

    const stripe = await verifiedStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      expand: ['data.items.data.price'],
    });
    const activeSubscription = subscriptions.data
      .filter((sub) => ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status))
      .sort((a, b) => (b.created || 0) - (a.created || 0))[0];
    if (!activeSubscription) return empty;
    if (!stripeObjectMatchesMode(activeSubscription.livemode) ||
        (activeSubscription.metadata.app && activeSubscription.metadata.app !== 'chatbot-template') ||
        activeSubscription.items.data.length !== 1) {
      throw new Error('Homepage subscription could not be verified.');
    }

    const currentItem = activeSubscription.items.data[0];
    const currentPlan = managedPlan(currentItem.price);
    let scheduledPlanKey: string | null = null;
    let scheduledDate: string | null = null;
    const scheduleId = typeof activeSubscription.schedule === 'string'
      ? activeSubscription.schedule
      : activeSubscription.schedule?.id;
    if (scheduleId) {
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      if (schedule.metadata?.app && schedule.metadata.app !== 'chatbot-template') {
        throw new Error('Subscription schedule is managed outside One Fin.');
      }
      const nextPhase = schedule.phases.find((phase) =>
        phase.start_date >= currentItem.current_period_end &&
        phase.items.some((item) => {
          const id = typeof item.price === 'string' ? item.price : item.price.id;
          return id !== currentItem.price.id;
        }),
      );
      const nextItem = nextPhase?.items[0];
      if (nextItem) {
        const nextPrice = typeof nextItem.price === 'string'
          ? await stripe.prices.retrieve(nextItem.price)
          : nextItem.price;
        if ('deleted' in nextPrice) {
          scheduledPlanKey = null;
          scheduledDate = null;
        } else {
          const nextPlan = managedPlan(nextPrice);
          if (nextPlan) {
            scheduledPlanKey = nextPlan.key;
            scheduledDate = new Date(nextPhase!.start_date * 1000).toISOString();
          } else {
            scheduledPlanKey = null;
            scheduledDate = null;
          }
        }
      } else {
        scheduledPlanKey = null;
        scheduledDate = null;
      }
    }
    const scheduledPlan = plans.find((plan) => plan.key === scheduledPlanKey) || null;
    const renewalDate = new Date(currentItem.current_period_end * 1000).toISOString();

    return {
      planName: currentPlan?.name || 'Homepage subscription',
      planKey: currentPlan?.key || null,
      subscriptionId: activeSubscription.id,
      status: activeSubscription.status,
      priceLabel: currentPlan ? priceLabel(currentPlan) : `${(currentItem.price.unit_amount || 0) / 100} ${currentItem.price.currency.toUpperCase()} / ${currentItem.price.recurring?.interval || 'billing period'}`,
      scheduledPlanKey,
      scheduledPlanName: scheduledPlan?.name || null,
      scheduledPriceLabel: scheduledPlan ? priceLabel(scheduledPlan) : null,
      scheduledDate,
      canUpgrade: Boolean(currentPlan),
      renewalDate,
      isCancelled: activeSubscription.cancel_at_period_end,
    };
  } catch (err) {
    console.error('Unexpected error checking subscription details:', err);
    return { ...empty, error: 'Subscription status is temporarily unavailable.' };
  }
}

// Server Action to cancel a subscription
export async function cancelSubscriptionAction(subscriptionId: string): Promise<{ success: boolean; error?: string }> {
   if (!subscriptionId) {
     return { success: false, error: "Subscription ID is required." };
   }
   try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'Please sign in.' };
    const updateClient = await createBillingClient();
    const { data: owned, error: ownershipError } = await updateClient.billing.getSubscriptions();
    if (ownershipError || !owned.subscriptions.some(sub => sub.id === subscriptionId)) {
      return { success: false, error: 'Subscription not found.' };
    }
    const { error } = await updateClient.billing.updateSubscription(subscriptionId, {
       cancel_at_period_end: true,
     });

     if (error) {
       console.error("Error cancelling subscription:", error);
       return { success: false, error: error.message || "Failed to cancel subscription." };
     }

     revalidatePath("/"); // Revalidate relevant paths after cancellation
     revalidatePath("/pricing");
     // Consider revalidating other paths where subscription state is shown

     return { success: true };

   } catch (err: unknown) { // Use unknown instead of any
     console.error("Unexpected error cancelling subscription:", err);
     // Type check the error
     const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
     return { success: false, error: errorMessage };
   }
}

// Server Action to reactivate a subscription
export async function reactivateSubscriptionAction(subscriptionId: string): Promise<{ success: boolean; error?: string }> {
  if (!subscriptionId) {
    return { success: false, error: "Subscription ID is required." };
  }
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'Please sign in.' };
    const updateClient = await createBillingClient();
    const { data: owned, error: ownershipError } = await updateClient.billing.getSubscriptions();
    if (ownershipError || !owned.subscriptions.some(sub => sub.id === subscriptionId)) {
      return { success: false, error: 'Subscription not found.' };
    }
    const { error } = await updateClient.billing.updateSubscription(subscriptionId, {
      cancel_at_period_end: false, // Set to false to reactivate
    });

    if (error) {
      console.error("Error reactivating subscription:", error);
      return { success: false, error: error.message || "Failed to reactivate subscription." };
    }

    revalidatePath("/"); 
    revalidatePath("/pricing");
    // Consider revalidating other paths

    return { success: true };

  } catch (err: unknown) { 
    console.error("Unexpected error reactivating subscription:", err);
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: errorMessage };
  }
}

// --- Model Settings Types --- 
// Keep interface exported

export interface UserModelSettings { enabledModels:string[]; selectedModel:string|null }
export async function getUserModelSettings():Promise<UserModelSettings> {
  const user=await currentUser();
  const defaults={enabledModels:availableModels.map(m=>m.id),selectedModel:defaultModel};
  if(!user) return defaults;
  const [profile]=await ownedQuery(user.id,'select enabled_models,selected_model from profiles where id=$1',[user.id]);
  if(!profile) return defaults;
  const enabledModels=Array.from(new Set<string>((profile.enabled_models || defaults.enabledModels).map(normalizeModel)));
  return {enabledModels,selectedModel:enabledModels.includes(normalizeModel(profile.selected_model))?normalizeModel(profile.selected_model):enabledModels[0]||null};
}
export async function updateUserModelSettings(ids:string[]) {
  if(!Array.isArray(ids) || !ids.length || ids.some(id=>!availableModels.some(m=>m.id===id))) return {success:false,error:'Select a supported model.'};
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  await ownedQuery(user.id,'update profiles set enabled_models=$1,selected_model=$2,updated_at=now() where id=$3',[ids,ids[0],user.id]);
  return {success:true};
}
export async function updateUserSelectedModel(id:string|null) {
  if(!id || !availableModels.some(m=>m.id===id)) return {success:false,error:'Invalid model.'};
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  await ownedQuery(user.id,'update profiles set selected_model=$1,updated_at=now() where id=$2 and $1=any(enabled_models)',[id,user.id]);
  return {success:true};
}
interface ClientMessage {id:string;sender:'user'|'ai';content:string}
type ClientImage=AIImage;
export async function getAIResponse(messages:ClientMessage[],model:string,contextItemId?:string|null,images:ClientImage[]=[]):Promise<{success:boolean;response?:string;error?:string}> {
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in to use chat.'};
  if(!Array.isArray(messages) || !messages.length || messages.length>100 || messages.some(m=>!m || typeof m.content!=='string' || m.content.length>32000 || !['user','ai'].includes(m.sender)) || messages.reduce((n,m)=>n+m.content.length,0)>128000) return {success:false,error:'Invalid or oversized conversation.'};
  const allowedImageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);
  if(!Array.isArray(images) || images.length>3 || images.some(image=>!image || !allowedImageTypes.has(image.mimeType) || typeof image.data!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) || images.reduce((total,image)=>total+image.data.length,0)>5_000_000) return {success:false,error:'Invalid or oversized image attachment.'};
  if(images.length && messages.at(-1)?.sender!=='user') return {success:false,error:'Images can only be attached to your latest message.'};
  const settings=await getUserModelSettings();
  if(!settings.enabledModels.includes(model)) return {success:false,error:'This model is not enabled.'};
  try {
    if(!aiConfiguration().apiKey) throw new Error('AI is not configured yet. Please try again later.');
    const [membership]=await ownedQuery(user.id,'select subscription_id from membership_access where user_id=$1 and expires_at>now() limit 1',[user.id]);
    if(!membership) throw new Error('An active chat subscription is required. Choose a plan to continue.');
    const context=contextItemId?await getContextItemById(contextItemId):null;
    if(contextItemId && !context) throw new Error('Context item was not found.');
    await throttle(`chat:${user.id}`,60);
    const response=await generateResponse(messages,context?.content,images);
    await ownedQuery(user.id,"insert into chat_usage(id,user_id,status,model_id) values(gen_random_uuid(),$1,'completed',$2)",[user.id,model]);
    return {success:true,response};
  } catch(error) {
    return {success:false,error:error instanceof Error?error.message:'Unable to generate a response.'};
  }
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function startNewChat(chatId:string,prompt:string,model:string|null,contextItemId?:string|null) {
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  if(!uuid.test(chatId) || !prompt.trim() || prompt.length>32000) return {success:false,error:'Invalid chat request.'};
  try {
    const [membership]=await ownedQuery(user.id,'select subscription_id from membership_access where user_id=$1 and expires_at>now() limit 1',[user.id]);
    if(!membership) return {success:false,error:'An active chat subscription is required. Choose a plan to continue.'};
    const context=contextItemId?await getContextItemById(contextItemId):null;
    if(contextItemId && !context) throw new Error('Context item not found.');
    const finalPrompt=context?`Reference: ${context.name}\n${context.content}\n\n${prompt}`:prompt;
    await transaction(async client=>{
      await client.query('insert into chats(id,user_id,model_id,name) values($1,$2,$3,$4)',[chatId,user.id,model,prompt.slice(0,50)]);
      await client.query("insert into messages(chat_id,user_id,sender,content,model_id) values($1,$2,'user',$3,$4)",[chatId,user.id,finalPrompt,model]);
    });
    revalidatePath('/'); return {success:true};
  } catch { return {success:false,error:'Unable to create chat.'}; }
}
export async function addMessage(chatId:string,sender:'user'|'ai',content:string,modelId?:string|null,messageId?:string) {
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  if(!uuid.test(chatId) || (messageId!==undefined && !uuid.test(messageId)) || !['user','ai'].includes(sender) || !content || content.length>128000) return {success:false,error:'Invalid message.'};
  try {
    await transaction(async client=>{
      const {rows}=await client.query('select id from chats where id=$1 and user_id=$2 for update',[chatId,user.id]);
      if(!rows.length) throw new Error('Chat not found.');
      await client.query('insert into messages(id,chat_id,user_id,sender,content,model_id) values(coalesce($1,gen_random_uuid()),$2,$3,$4,$5,$6)',[messageId||null,chatId,user.id,sender,content,modelId]);
      await client.query('update chats set updated_at=now() where id=$1 and user_id=$2',[chatId,user.id]);
    });
    return {success:true};
  } catch { return {success:false,error:'Unable to save message.'}; }
}
export async function updateAssistantMessage(chatId:string,messageId:string,content:string,modelId?:string|null) {
  const user=await currentUser();
  if(!user) return {success:false,error:'Please sign in.'};
  if(!uuid.test(chatId) || !uuid.test(messageId) || !content.trim() || content.length>128000) return {success:false,error:'Invalid response.'};
  try {
    const rows=await ownedQuery(user.id,`update messages m set content=$1,model_id=$2
      from chats c where m.id=$3 and m.chat_id=$4 and m.user_id=$5 and m.sender='ai'
      and c.id=m.chat_id and c.user_id=$5 returning m.id`,[content,modelId||null,messageId,chatId,user.id]);
    return {success:!!rows.length,error:rows.length?undefined:'Response not found.'};
  } catch(error) {
    console.error('Unable to update chat response:',error);
    return {success:false,error:'Unable to save the retried response.'};
  }
}
export async function getChatHistory():Promise<{id:string;title:string}[]> {
  const user=await currentUser(); if(!user) return [];
  return ownedQuery(user.id,"select id,coalesce(name,'Untitled chat') as title from chats where user_id=$1 and area='chat' and archived=false order by pinned desc,updated_at desc",[user.id]);
}
export async function getMessagesForChat(chatId:string):Promise<{id:string;sender:'user'|'ai';content:string;created_at:string}[]> {
  const user=await currentUser(); if(!user || !uuid.test(chatId)) return [];
  return ownedQuery(user.id,'select id,sender,content,created_at::text from messages where chat_id=$1 and user_id=$2 order by created_at,id',[chatId,user.id]);
}
export async function updateChatName(chatId:string,name:string) {
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  if(!uuid.test(chatId) || !name.trim() || name.length>200) return {success:false,error:'Invalid chat name.'};
  const rows=await ownedQuery(user.id,'update chats set name=$1,updated_at=now() where id=$2 and user_id=$3 returning id',[name.trim(),chatId,user.id]);
  revalidatePath('/'); return {success:!!rows.length,error:rows.length?undefined:'Chat not found.'};
}
export async function deleteChat(chatId:string) {
  const user=await currentUser(); if(!user || !uuid.test(chatId)) return {success:false,error:'Chat not found.'};
  const rows=await ownedQuery(user.id,'delete from chats where id=$1 and user_id=$2 returning id',[chatId,user.id]);
  revalidatePath('/'); return {success:!!rows.length};
}
export interface ContextItem {id:string;user_id:string;name:string;content:string;created_at:string;updated_at:string}
export async function getContextItems():Promise<ContextItem[]> {
  const user=await currentUser(); if(!user) return [];
  return ownedQuery(user.id,'select id,user_id,name,content,created_at::text,updated_at::text from context_items where user_id=$1 order by updated_at desc',[user.id]);
}
export async function addContextItem(name:string,content:string):Promise<{success:boolean;error?:string;newItem?:ContextItem}> {
  const user=await currentUser(); if(!user) return {success:false,error:'Please sign in.'};
  if(!name.trim() || name.length>200 || !content.trim() || content.length>64000) return {success:false,error:'Enter a name and content within the allowed size.'};
  const [newItem]=await ownedQuery<ContextItem>(user.id,'insert into context_items(user_id,name,content) values($1,$2,$3) returning id,user_id,name,content,created_at::text,updated_at::text',[user.id,name.trim(),content.trim()]);
  revalidatePath('/context'); return {success:true,newItem};
}
export async function updateContextItem(id:string,name:string,content:string):Promise<{success:boolean;error?:string;updatedItem?:ContextItem}> {
  const user=await currentUser(); if(!user || !uuid.test(id)) return {success:false,error:'Context item not found.'};
  if(!name.trim() || name.length>200 || !content.trim() || content.length>64000) return {success:false,error:'Enter a valid name and content.'};
  const [updatedItem]=await ownedQuery<ContextItem>(user.id,'update context_items set name=$1,content=$2,updated_at=now() where id=$3 and user_id=$4 returning id,user_id,name,content,created_at::text,updated_at::text',[name.trim(),content.trim(),id,user.id]);
  revalidatePath('/context'); return {success:!!updatedItem,updatedItem,error:updatedItem?undefined:'Context item not found.'};
}
export async function deleteContextItem(id:string) {
  const user=await currentUser(); if(!user || !uuid.test(id)) return {success:false,error:'Context item not found.'};
  const rows=await ownedQuery(user.id,'delete from context_items where id=$1 and user_id=$2 returning id',[id,user.id]);
  revalidatePath('/context'); return {success:!!rows.length};
}
export async function getContextItemById(id:string):Promise<ContextItem|null> {
  const user=await currentUser(); if(!user || !uuid.test(id)) return null;
  const [item]=await ownedQuery<ContextItem>(user.id,'select id,user_id,name,content,created_at::text,updated_at::text from context_items where id=$1 and user_id=$2',[id,user.id]);
  return item||null;
}
