import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function load(file,dependencies={},env={}){
 const exports={};
 const {outputText}=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 const scope=dependencies['./billing-scope']||(file==='lib/billing-scope.ts'?undefined:load('lib/billing-scope.ts',{'./billing-environment':dependencies['./billing-environment']||{stripeObjectMatchesMode:livemode=>!livemode}},env));
 const modules={...dependencies,'./site-url':dependencies['./site-url']||{sitePath:path=>`https://onefinsolution.net${path}`},...(scope?{'./billing-scope':scope}:{})};
 runInNewContext(outputText,{exports,require:name=>name==='server-only'?{}:modules[name]||require(name),process:{env},Buffer,console,URL,Headers,Error});
 return exports;
}
async function fixture(){const db=new PGlite();for(const file of readdirSync(new URL('../migrations/railway/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(`../migrations/railway/${file}`,import.meta.url),'utf8'));const adapter={query:async(sql,args)=>(await db.query(sql,args)).rows,transaction:work=>db.transaction(tx=>work({query:(sql,args)=>tx.query(sql,args)}))};return {db,adapter};}
test('legacy visitor reservation records can only be refunded once',async()=>{
 const {db,adapter}=await fixture();try{const usage=load('lib/visitor-usage.ts',{'./db':adapter});
 const reservations=await Promise.all(Array.from({length:25},()=>usage.reserveVisitor(['network','browser','cookie'])));
 assert.equal(reservations.length,25);assert.equal((await db.query('select count(*)::int as count from visitor_requests')).rows[0].count,25);
 assert.equal((await db.query('select count(*)::int as count from visitor_usage')).rows[0].count,0);
 const failed=reservations[0];await usage.finishVisitor(failed,false);await usage.finishVisitor(failed,false);
 assert.equal((await db.query('select status from visitor_requests where id=$1',[failed])).rows[0].status,'refunded');
 const completed=reservations[1];await usage.finishVisitor(completed,true);await usage.finishVisitor(completed,false);
 assert.equal((await db.query('select status from visitor_requests where id=$1',[completed])).rows[0].status,'completed');
 }finally{await db.close();}
});
test('trusted network and keyed browser fingerprints persist without exposing raw identifiers',()=>{
 const identity=load('lib/abuse-identity.ts',{}, {NODE_ENV:'production',WORKSPACE_SIGNING_KEY:'fixture-key-that-is-at-least-32-characters'});
 const a=identity.visitorIdentities(new Headers({'x-real-ip':'203.0.113.4'}),'cookie-one','a'.repeat(64));
 const b=identity.visitorIdentities(new Headers({'x-real-ip':'203.0.113.4','x-forwarded-for':'1.2.3.4'}),'cookie-two','b'.repeat(64));
 assert.equal(a.filter(value=>b.includes(value)).length,1);assert.ok(a.every(value=>/^[a-f0-9]{64}$/.test(value)));
 assert.throws(()=>identity.visitorIdentities(new Headers({'x-forwarded-for':'1.2.3.4'}),'cookie','a'.repeat(64)),/network/);
 const v6a=identity.visitorIdentities(new Headers({'x-real-ip':'2001:db8:abcd:1234::1'}),'one','a'.repeat(64));
 const v6b=identity.visitorIdentities(new Headers({'x-real-ip':'2001:db8:abcd:1234::ff'}),'two','b'.repeat(64));assert.equal(v6a.filter(value=>v6b.includes(value)).length,1);
});
test('verified Workspace PaymentIntent grants the fixed pack once without creating chat access',async()=>{
 const {db,adapter}=await fixture();try{
  const user=randomUUID(),purchase=randomUUID(),intentId='pi_workspace_test';
  await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'workspace@example.test','fixture',now())",[user]);
  await db.query('insert into billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_subscription_test']);
  await db.query('insert into workspace_billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_workspace_test']);
  await db.query("insert into workspace_credit_purchases(id,user_id,stripe_payment_intent,amount,credits,status) values($1,$2,$3,500,50,'pending')",[purchase,user,intentId]);
  const intent={id:intentId,status:'succeeded',livemode:false,amount:500,amount_received:500,currency:'usd',customer:'cus_workspace_test',payment_method:'pm_test',metadata:{app:'chatbot-template',flow:'workspace-credit-purchase',purchase_id:purchase,user_id:user,pack_id:'workspace-50',price_id:'price_credit_50'}};
  const stripe={paymentIntents:{retrieve:async()=>intent}};
  const fulfillment=load('lib/stripe-fulfillment.ts',{
   './db':adapter,
   './billing-environment':{stripeObjectMatchesMode:livemode=>!livemode},
   './credit-config':{creditPlans:()=>({price_credit_50:{kind:'pack',credits:50}})},
   './subscription-catalog':{managedPlan:()=>undefined},
   './billing-notices':{queueBillingNotice:async()=>{}},
   './plans':{priceLabel:()=>''},
   './workspace-credit-pack':{workspaceCreditPack:{id:'workspace-50',credits:50,amount:500,currency:'usd'}},
  });
  const event={type:'payment_intent.succeeded',livemode:false,data:{object:{id:intentId}}};
  intent.customer='cus_subscription_test';
  await assert.rejects(fulfillment.fulfillStripeEvent(stripe,event),/Customer mapping unavailable/);
  assert.equal(Number((await db.query('select available_credits($1)::int as balance',[user])).rows[0].balance),0);
  intent.customer='cus_workspace_test';
  await fulfillment.fulfillStripeEvent(stripe,event);await fulfillment.fulfillStripeEvent(stripe,event);
  assert.equal(Number((await db.query('select available_credits($1)::int as balance',[user])).rows[0].balance),50);
  assert.equal((await db.query('select * from workspace_credit_transactions where user_id=$1',[user])).rows.length,1);
  assert.equal((await db.query("select status from workspace_credit_purchases where id=$1",[purchase])).rows[0].status,'succeeded');
  assert.equal((await db.query('select * from membership_access where user_id=$1',[user])).rows.length,0);
 }finally{await db.close();}
});
test('Workspace billing profiles, preferences, and Stripe customer mappings stay separate from subscriptions',async()=>{
 const {db,adapter}=await fixture();try{
  const user=randomUUID();
  await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'scope@example.test','fixture',now())",[user]);
  const account=load('lib/account-service.ts',{'./db':adapter,'./account-preferences':load('lib/account-preferences.ts')});
  const workspaceProfile=load('lib/workspace-billing-profile.ts',{'./db':adapter});
  const softwareProfile=load('lib/software-billing-profile.ts',{'./db':adapter,'@/lib/db':adapter});
  await account.updateProfileDetails(user,{fullName:'Subscription Name',billingLine1:'Subscription Street',billingCountry:'US'});
  await workspaceProfile.updateWorkspaceBillingProfile(user,{
   fullName:'Workspace Name',phone:'555-0200',companyName:'Workspace Co',
   billingName:'Workspace Billing',billingLine1:'Workspace Street',billingLine2:'',
   billingCity:'London',billingState:'',billingPostal:'W1A',billingCountry:'GB',
   shippingName:'Workspace Recipient',shippingLine1:'Workspace Shipping Street',shippingLine2:'',
   shippingCity:'London',shippingState:'',shippingPostal:'W1B',shippingCountry:'GB',
   shippingSameAsBilling:false,
  });
  await softwareProfile.updateSoftwareBillingProfile(user,{
   fullName:'Software Name',phone:'555-0300',companyName:'Software Co',
   billingName:'Software Billing',billingLine1:'Software Street',billingLine2:'',
   billingCity:'Toronto',billingState:'ON',billingPostal:'M5H',billingCountry:'CA',
   shippingName:'Software Recipient',shippingLine1:'Software Shipping Street',shippingLine2:'',
   shippingCity:'Toronto',shippingState:'ON',shippingPostal:'M5J',shippingCountry:'CA',
   shippingSameAsBilling:false,
  });
  const subscriptionAddress=(await db.query('select full_name,billing_line1,billing_country from app_users where id=$1',[user])).rows[0];
  const savedWorkspace=await workspaceProfile.readWorkspaceBillingProfile(user);
  const savedSoftware=await softwareProfile.readSoftwareBillingProfile(user);
  assert.deepEqual(subscriptionAddress,{full_name:'Subscription Name',billing_line1:'Subscription Street',billing_country:'US'});
  assert.equal(savedWorkspace.fullName,'Workspace Name');
  assert.equal(savedWorkspace.billingLine1,'Workspace Street');
  assert.equal(savedWorkspace.shippingLine1,'Workspace Shipping Street');
  assert.equal(savedSoftware.fullName,'Software Name');
  assert.equal(savedSoftware.billingLine1,'Software Street');
  assert.equal(savedSoftware.shippingLine1,'Software Shipping Street');
  const prefs={theme:'dark',timezone:'Europe/London',enter_to_send:false,spellcheck:true,context_enabled:false,product_updates:true};
  await account.writePreferences(user,{...prefs,theme:'light'});
  await account.writeWorkspacePreferences(user,prefs);
  assert.equal((await account.readPreferences(user)).theme,'light');
  assert.equal((await account.readWorkspacePreferences(user)).theme,'dark');
  await db.query('insert into billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_subscription_separate']);
  const created=[];
  const updates=[];
  const stripe={customers:{
   create:async params=>{created.push(params);return{id:'cus_workspace_separate'};},
   retrieve:async id=>({id,livemode:false,metadata:{app:'chatbot-template',billing_scope:'workspace',user_id:user}}),
   update:async(id,params)=>{updates.push({id,params});return{id,...params};},
  }};
  const workspaceStripe=load('lib/workspace-stripe.ts',{'./db':adapter,'./stripe':{verifiedStripe:async()=>stripe},'./workspace-billing-profile':workspaceProfile});
  assert.equal(await workspaceStripe.workspaceCustomer(user,true),'cus_workspace_separate');
  assert.equal((await db.query('select customer_id from billing_customers where user_id=$1',[user])).rows[0].customer_id,'cus_subscription_separate');
  assert.equal((await db.query('select customer_id from workspace_billing_customers where user_id=$1',[user])).rows[0].customer_id,'cus_workspace_separate');
  await db.query('insert into software_billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_software_separate']);
  assert.equal((await db.query('select customer_id from software_billing_customers where user_id=$1',[user])).rows[0].customer_id,'cus_software_separate');
  assert.equal(created[0].metadata.billing_scope,'workspace');
  assert.equal(created[0].name,'Workspace Billing');
  assert.equal(created[0].address.line1,'Workspace Street');
  await workspaceStripe.syncWorkspaceCustomerProfile(user,savedWorkspace);
  assert.equal(updates[0].params.name,'Workspace Billing');
  assert.equal(updates[0].params.shipping.address.line1,'Workspace Shipping Street');
 }finally{await db.close();}
});
test('billing cutover quarantines legacy Workspace cards and preserves customer ownership for pending events',async()=>{
 const db=new PGlite();try{
  const migrations=readdirSync(new URL('../migrations/railway/',import.meta.url))
   .filter(file=>file.endsWith('.sql')&&file!=='011_billing_scope_isolation.sql').sort();
  for(const file of migrations) await db.exec(readFileSync(new URL(`../migrations/railway/${file}`,import.meta.url),'utf8'));
  const user=randomUUID();
  await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'legacy@example.test','fixture',now())",[user]);
  await db.query('insert into billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_legacy_shared']);
  await db.query(
   "insert into workspace_credit_settings(user_id,payment_method_id,card_brand,card_last4) values($1,'pm_workspace_legacy','visa','4242')",
   [user],
  );
  await db.exec(readFileSync(new URL('../migrations/railway/011_billing_scope_isolation.sql',import.meta.url),'utf8'));
  const legacyCustomer=(await db.query('select customer_id from workspace_legacy_billing_customers where user_id=$1',[user])).rows[0];
  const legacyMethod=(await db.query('select payment_method_id from workspace_legacy_payment_methods where user_id=$1',[user])).rows[0];
  const settings=(await db.query('select payment_method_id,card_brand,card_last4 from workspace_credit_settings where user_id=$1',[user])).rows[0];
  assert.equal(legacyCustomer.customer_id,'cus_legacy_shared');
  assert.equal(legacyMethod.payment_method_id,'pm_workspace_legacy');
  assert.deepEqual(settings,{payment_method_id:null,card_brand:null,card_last4:null});
 }finally{await db.close();}
});
test('account sessions require a fresh login after an absolute 30-day expiry',async()=>{
 const {db,adapter}=await fixture();try{const user=randomUUID();await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'session@example.test','fixture',now())",[user]);const password=load('lib/password.ts');let savedCookie;
 const session=load('lib/session.ts',{'./db':adapter,'./password':password,'./session-cookie':{sessionCookie:'__Secure-onefin-session',legacySessionCookie:'__Host-onefin-session',sessionCookieOptions:maxAge=>({httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge})},'react':{cache:fn=>fn},'next/headers':{cookies:async()=>({set:(name,value,options)=>{savedCookie={name,value,options};}})}},{NODE_ENV:'production'});
 await session.createSession(user);assert.equal(savedCookie.options.maxAge,30*86400);assert.equal(savedCookie.options.secure,true);assert.equal((await session.userFromToken(savedCookie.value)).id,user);
 const [row]=await adapter.query('select extract(epoch from expires_at-created_at)::int as seconds from app_sessions');assert.equal(row.seconds,30*86400);
 await db.query("update app_sessions set expires_at=now()-interval '1 second'");assert.equal(await session.userFromToken(savedCookie.value),null);
 }finally{await db.close();}
});
test('card-first trials, retry recovery, cross-account card claims, paid access and scheduled changes',async()=>{
 const {db,adapter}=await fixture();try{
 const first=randomUUID(),second=randomUUID();let current=first;
 for(const [id,email]of[[first,'one@example.test'],[second,'two@example.test']]){await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,$2,'fixture',now())",[id,email]);await db.query('insert into profiles(id) values($1)',[id]);await db.query('insert into billing_customers(user_id,customer_id) values($1,$2)',[id,`cus_${id}`]);}
 const mode={expectedStripeLivemode:()=>false,stripeObjectMatchesMode:livemode=>!livemode};
 const plans=load('lib/plans.ts'),catalog=load('lib/subscription-catalog.ts',{'./plans':plans,'./billing-environment':mode});
 const prices=plans.plans.map(plan=>({id:`price_${plan.key}`,lookup_key:plans.lookupKey(plan.key),active:true,livemode:false,currency:'usd',unit_amount:plan.amount,recurring:{interval:plan.interval,interval_count:1},metadata:{app:'chatbot-template'}}));
 const setups=new Map(),subs=new Map(),notices=[];let creates=0,verificationIntents=0,throwAfterCreate=false,capturedSchedule;
 const stripe={prices:{list:async({lookup_keys})=>({data:prices.filter(price=>lookup_keys.includes(price.lookup_key))}),retrieve:async id=>prices.find(price=>price.id===id)},setupIntents:{create:async params=>{const id=`seti_${randomUUID()}`;const setup={...params,id,status:'requires_payment_method',livemode:false,client_secret:'fixture-secret'};setups.set(id,setup);return setup;},retrieve:async id=>setups.get(id)},paymentMethods:{retrieve:async id=>({id,type:'card',customer:`cus_${current}`,card:{fingerprint:'same-card',iin:'424242'}}),detach:async()=>{}},paymentIntents:{create:async params=>{verificationIntents++;return {...params,id:'pi_verification',status:'requires_capture',last_payment_error:null};},cancel:async()=>{}},subscriptions:{list:async({customer})=>({data:[...subs.values()].filter(sub=>sub.customer===customer),has_more:false}),retrieve:async id=>subs.get(id),create:async params=>{creates++;const now=Math.floor(Date.now()/1000),id=`sub_${creates}`;const sub={...params,id,livemode:false,status:params.trial_end?'trialing':'incomplete',trial_end:params.trial_end||null,cancel_at_period_end:false,items:{data:[{price:prices.find(price=>price.id===params.items[0].price),quantity:1,current_period_start:now,current_period_end:params.trial_end||now+2592000}]},latest_invoice:null};subs.set(id,sub);if(throwAfterCreate){throwAfterCreate=false;throw new Error('simulated lost response');}return sub;}},invoices:{retrieve:async()=>invoice,listLineItems:async function*(){yield line;}},subscriptionSchedules:{create:async()=>({id:'sched_1',current_phase:null}),update:async(id,value)=>{capturedSchedule=value;},retrieve:async()=>({id:'sched_1',metadata:{app:'chatbot-template'}}),release:async()=>{}}};
 stripe.customers={retrieve:async id=>({id,livemode:false,deleted:false,metadata:{app:'chatbot-template',billing_scope:'subscription',user_id:id.slice(4)}})};
 const fulfillment=load('lib/stripe-fulfillment.ts',{'./db':adapter,'./credit-config':{creditPlans:()=>({})},'./subscription-catalog':catalog,'./billing-notices':{queueBillingNotice:async(...args)=>notices.push(args)},'./plans':plans,'./workspace-credit-pack':{workspaceCreditPack:{id:'workspace-50',credits:50,amount:500,currency:'usd'}},'./billing-environment':mode});
 const enroll=load('lib/subscription-enrollment.ts',{'./db':adapter,'./stripe':{verifiedStripe:async()=>stripe},'./stripe-billing':{currentCustomer:async()=>`cus_${current}`},'./subscription-catalog':catalog,'./plans':plans,'./abuse-identity':{privateHash:value=>value},'./stripe-fulfillment':fulfillment,'./billing-environment':mode});
 const setup=await enroll.prepareEnrollment(first,'monthly','trial');await assert.rejects(enroll.completeEnrollment(first,setup.setupId,true),/verification/);assert.equal(creates,0);
 setups.get(setup.setupId).status='succeeded';setups.get(setup.setupId).payment_method='pm_card';
 await assert.rejects(enroll.completeEnrollment(first,setup.setupId,false),/terms/);
 throwAfterCreate=true;await assert.rejects(enroll.completeEnrollment(first,setup.setupId,true),/lost response/);
 assert.equal((await adapter.query('select * from billing_trial_claims')).length,1);
 const result=await enroll.completeEnrollment(first,setup.setupId,true);assert.equal(result.status,'trialing');assert.equal(creates,1);
 await enroll.completeEnrollment(first,setup.setupId,true);assert.equal(creates,1);
 const [access]=await adapter.query('select * from membership_access where user_id=$1',[first]);assert.ok(access.expires_at>new Date());assert.equal(notices[0][0],'trial:sub_1');
 current=second;const other=await enroll.prepareEnrollment(second,'daily','trial');setups.get(other.setupId).status='succeeded';setups.get(other.setupId).payment_method='pm_other';await assert.rejects(enroll.completeEnrollment(second,other.setupId,true),/already been used/);assert.equal(creates,1);
 current=first;
 assert.equal(verificationIntents,0,'A successful SetupIntent must not create a separate authorization hold.');
 const billing=load('lib/stripe-billing.ts',{'./db':adapter,'./stripe':{verifiedStripe:async()=>stripe},'./session':{currentUser:async()=>({id:first,email:'one@example.test'})},'./subscription-catalog':catalog,'./plans':plans,'./stripe-fulfillment':fulfillment,'./credit-config':{},'./site-url':{},'./billing-environment':mode});
 stripe.subscriptionSchedules.create=async params=>{assert.equal(Object.hasOwn(params,'metadata'),false,'Stripe rejects metadata alongside from_subscription.');return {id:'sched_1',current_phase:null};};
 await billing.schedulePlanChange('weekly');assert.equal(capturedSchedule.proration_behavior,'none');assert.equal(capturedSchedule.phases[0].trial_end,subs.get('sub_1').trial_end);assert.equal(capturedSchedule.phases[1].duration.interval,'week');assert.equal(capturedSchedule.phases[1].trial_end,undefined);
 assert.equal(capturedSchedule.metadata.app,'chatbot-template');
 const credits=load('lib/credits.ts',{'./db':adapter,'./credit-config':{signupCredits:()=>0,workspaceCreditCost:()=>1}});
 await db.query("select grant_credits($1,$2,1)",[second,'fixture:workspace-credit']);
 const use=await credits.reserveWorkspaceCredits(second);await credits.finishWorkspaceCredits(second,use,true);
 assert.equal((await adapter.query("select status from credit_usage where user_id=$1 and status='completed'",[second])).length,1);
 await assert.rejects(credits.reserveWorkspaceCredits(first),/Insufficient credits/);
 let invoice={id:'in_paid',parent:{subscription_details:{subscription:'sub_1',metadata:{app:'chatbot-template'}}},customer:`cus_${first}`,livemode:false,status:'paid',currency:'usd',amount_paid:0,amount_remaining:0};
 let line={id:'line',quantity:1,amount:3000,pricing:{price_details:{price:'price_monthly'}},period:{end:Math.floor(Date.now()/1000)+2592000}};
 const event={type:'invoice.paid',livemode:false,data:{object:{id:'in_paid'}}};await fulfillment.fulfillStripeEvent(stripe,event);assert.equal((await adapter.query('select expires_at from membership_access'))[0].expires_at.getTime(),access.expires_at.getTime());
 subs.get('sub_1').status='active';invoice.amount_paid=3000;await fulfillment.fulfillStripeEvent(stripe,event);await fulfillment.fulfillStripeEvent(stripe,event);const expires=(await adapter.query('select expires_at from membership_access'))[0].expires_at;assert.equal(expires.getTime(),line.period.end*1000);
 assert.equal((await adapter.query('select * from credit_buckets where user_id=$1',[first])).length,0);
 line.period.end-=86400;await fulfillment.fulfillStripeEvent(stripe,event);assert.equal((await adapter.query('select expires_at from membership_access'))[0].expires_at.getTime(),expires.getTime());
 await db.query("update membership_access set expires_at=now()-interval '1 second'");await assert.rejects(credits.reserveWorkspaceCredits(first),/Insufficient credits/);
 }finally{await db.close();}
});
test('trial plan changes create a Stripe schedule without forbidden creation metadata',async()=>{
 const {db,adapter}=await fixture();try{
  const user=randomUUID();await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'schedule@example.test','fixture',now())",[user]);
  await db.query('insert into billing_customers(user_id,customer_id) values($1,$2)',[user,'cus_schedule']);
  const mode={expectedStripeLivemode:()=>false,stripeObjectMatchesMode:livemode=>!livemode};
  const planCatalog=load('lib/plans.ts');
  const prices=planCatalog.plans.filter(plan=>plan.key!=='custom').map(plan=>({id:`price_${plan.key}`,lookup_key:planCatalog.lookupKey(plan.key),active:true,livemode:false,currency:'usd',unit_amount:plan.amount,recurring:{interval:plan.interval,interval_count:1},metadata:{app:'chatbot-template'}}));
  const now=Math.floor(Date.now()/1000),trialEnd=now+86400;
  const subscription={id:'sub_schedule',customer:'cus_schedule',livemode:false,status:'trialing',metadata:{app:'chatbot-template'},cancel_at_period_end:false,trial_end:trialEnd,schedule:null,items:{data:[{price:prices.find(price=>price.id==='price_monthly'),quantity:1,current_period_start:now,current_period_end:trialEnd}]}};
  let scheduleCreateParams,scheduledUpdate;
  const stripe={prices:{list:async({lookup_keys})=>({data:prices.filter(price=>lookup_keys.includes(price.lookup_key))})},subscriptions:{list:async()=>({data:[subscription],has_more:false})},subscriptionSchedules:{create:async params=>{scheduleCreateParams=params;return{id:'sched_trial',current_phase:null};},update:async(_id,params)=>{scheduledUpdate=params;}}};
  stripe.customers={retrieve:async id=>({id,livemode:false,deleted:false,metadata:{}})};
  const catalog=load('lib/subscription-catalog.ts',{'./plans':planCatalog,'./billing-environment':mode});
  const billing=load('lib/stripe-billing.ts',{'./db':adapter,'./stripe':{verifiedStripe:async()=>stripe},'./session':{currentUser:async()=>({id:user,email:'schedule@example.test'})},'./subscription-catalog':catalog,'./plans':planCatalog,'./stripe-fulfillment':{},'./credit-config':{},'./site-url':{},'./billing-environment':mode});
  const effectiveDate=await billing.schedulePlanChange('weekly');
  assert.equal(scheduleCreateParams.from_subscription,subscription.id);
  assert.deepEqual(Object.keys(scheduleCreateParams),['from_subscription']);
  assert.equal(scheduledUpdate.metadata.app,'chatbot-template');
  assert.equal(scheduledUpdate.proration_behavior,'none');
  assert.equal(scheduledUpdate.phases[0].end_date,trialEnd);
  assert.equal(scheduledUpdate.phases[0].trial_end,trialEnd);
  assert.equal(scheduledUpdate.phases[1].items[0].price,'price_weekly');
  assert.equal(scheduledUpdate.phases[1].duration.interval,'week');
  assert.equal(new Date(effectiveDate).getTime(),trialEnd*1000);
 }finally{await db.close();}
});
