import { currentUser } from '@/lib/session';
import { ownedQuery } from '@/lib/db';
export const runtime='nodejs';
export async function GET() {
  const user=await currentUser(); if(!user) return Response.json({error:'Please sign in.'},{status:401});
  const [profile,preferences,chats,messages,context,credits,workspaceUsage,workspacePurchases,workspaceTransactions,workspacePaymentMethod,chatUsage,subscriptions,support,feedback]=await Promise.all([
    ownedQuery(user.id,'select full_name,username,website,enabled_models,selected_model from profiles where id=$1',[user.id]),
    ownedQuery(user.id,'select theme,timezone,enter_to_send,spellcheck,context_enabled,product_updates from account_settings where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,name,model_id,area,pinned,archived,project,created_at,updated_at from chats where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,chat_id,sender,content,model_id,created_at from messages where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,name,content,created_at,updated_at from context_items where user_id=$1',[user.id]),
    ownedQuery(user.id,'select total,remaining,expires_at,created_at from credit_buckets where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,status,created_at from credit_usage where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,amount,credits,status,created_at,completed_at from workspace_credit_purchases where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,amount,currency,credits,created_at from workspace_credit_transactions where user_id=$1',[user.id]),
    ownedQuery(user.id,'select card_brand,card_last4,card_exp_month,card_exp_year,updated_at from workspace_credit_settings where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,status,model_id,created_at from chat_usage where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,price_id,status,period_start,period_end,cancel_at_period_end from billing_subscriptions where user_id=$1',[user.id]),
    ownedQuery(user.id,'select id,category,subject,message,status,response,created_at from support_requests where user_id=$1',[user.id]),
    ownedQuery(user.id,'select message_id,rating,detail,updated_at from message_feedback where user_id=$1',[user.id]),
  ]);
  return Response.json({exportedAt:new Date().toISOString(),account:{email:user.email,emailVerifiedAt:user.email_verified_at},profile:profile[0],preferences:preferences[0]||{},chats,messages,context,workspace:{credits,usage:workspaceUsage,purchases:workspacePurchases,transactions:workspaceTransactions,paymentMethod:workspacePaymentMethod[0]||null},chat:{usage:chatUsage,subscriptions,feedback},support},{headers:{'Content-Disposition':'attachment; filename="onefin-account-data.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
