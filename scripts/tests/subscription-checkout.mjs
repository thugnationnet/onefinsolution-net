import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, relative } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const user = '11111111-1111-4111-8111-111111111111';
const customer = 'cus_subscription';
const enrollmentId = '22222222-2222-4222-8222-222222222222';
function page(data) {
  const promise = Promise.resolve({ data, has_more: false });
  promise[Symbol.asyncIterator] = async function* () { yield* data; };
  return promise;
}

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table app_users(id uuid primary key);
    insert into app_users values('${user}');
    create table billing_customers(user_id uuid,customer_id text);
    insert into billing_customers values('${user}','${customer}');
    create table billing_enrollments(user_id uuid primary key,request_id uuid unique,plan_key text,mode text,
      price_id text,setup_id text,subscription_id text,trial_end bigint,consent_at timestamptz,created_at timestamptz default now());
    create table billing_trial_claims(user_id uuid primary key,card_hash text unique not null,request_id uuid unique not null);
    create table billing_subscriptions(id text primary key,user_id uuid,price_id text,status text,period_start timestamptz,
      period_end timestamptz,cancel_at_period_end boolean,observed_at timestamptz,trial_end timestamptz,next_plan_key text,next_plan_at timestamptz);
    create table membership_access(subscription_id text primary key,user_id uuid,plan_key text,expires_at timestamptz,updated_at timestamptz default now());
    create table billing_notices(reference text primary key,user_id uuid,subject text,body text);
    create table workspace_legacy_payment_methods(user_id uuid,payment_method_id text);
    create table workspace_legacy_billing_customers(user_id uuid,customer_id text);
    create table stripe_webhook_events(event_id text primary key,event_type text,livemode boolean,status text,
      attempts int,received_at timestamptz,updated_at timestamptz,processed_at timestamptz,last_error text);
  `);
  const calls = [], sessions = new Map(), subs = [], schedules = new Map();
  const prices = ['daily','weekly','monthly','yearly'].map((key,i) => ({ id: `price_${key}`, lookup_key: `onefin_v2_${key}`, currency: 'usd', unit_amount: [500,1300,3000,24900][i], recurring: { interval: ['day','week','month','year'][i], interval_count: 1 }, metadata: { app: 'chatbot-template' }, livemode: false, active: true }));
  const customerObj = { id: customer, livemode: false, metadata: { app: 'chatbot-template', billing_scope: 'subscription', user_id: user }, invoice_settings: {} };
  const methods = [{id:'pm_saved',customer,card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2030}},{id:'pm_other',customer,card:{brand:'visa',last4:'4444',exp_month:12,exp_year:2030}}];
  const stripe = {
    customers: { retrieve: async () => customerObj, create: async () => customerObj,
      update: async (id,params) => { calls.push(['customer.update',id,params]); Object.assign(customerObj,params); return customerObj; } },
    paymentMethods: { retrieve: async id => methods.find(x=>x.id===id) || {id,customer:'cus_foreign'}, list: () => page(methods), detach: async id => { calls.push(['detach',id]); } },
    prices: { retrieve: async id => prices.find(p=>p.id===id), list: async ({lookup_keys}) => ({data:prices.filter(p=>lookup_keys.includes(p.lookup_key))}) },
    checkout: { sessions: {
      create: async params => { calls.push(['checkout.create',params]); const s={...params,id:`cs_test_session${sessions.size}`,livemode:false,status:'open',url:'https://checkout.stripe.com/session',payment_status:'unpaid'};sessions.set(s.id,s);return s; },
      retrieve: async id => { if(!sessions.has(id))throw Error('Unknown session');return sessions.get(id); },
      expire: async id => {sessions.get(id).status='expired';calls.push(['checkout.expire',id]);},
    } },
    subscriptions: { list: () => page(subs), retrieve: async id => {const s=subs.find(s=>s.id===id);if(!s)throw Error('Unknown subscription');return s;},
      update: async (id,params) => {calls.push(['subscription.update',id,params]);Object.assign(subs.find(s=>s.id===id),params);return subs.find(s=>s.id===id);} },
    subscriptionSchedules: {
      retrieve: async id => schedules.get(id),
      create: async ({from_subscription}) => {const sub=subs.find(s=>s.id===from_subscription);const s={id:'sched_test',metadata:{},current_phase:{start_date:sub.items.data[0].current_period_start}};schedules.set(s.id,s);sub.schedule=s.id;calls.push(['schedule.create']);return s;},
      update: async (id,params) => {calls.push(['schedule.update',params]);Object.assign(schedules.get(id),params);return schedules.get(id);},
      release: async id => {calls.push(['schedule.release',id]);for(const sub of subs)if(sub.schedule===id)sub.schedule=null;},
    },
    setupIntents: { retrieve: async () => ({id:'seti_saved',livemode:false,status:'succeeded',customer,payment_method:'pm_saved',metadata:{billing_scope:'subscription',user_id:user}}) },
    invoices: { retrieve: async () => ({id:'in_zero',livemode:false,status:'paid',currency:'usd',amount_paid:0,customer,parent:{subscription_details:{metadata:{app:'chatbot-template'},subscription:'sub_test'}}}) },
    webhooks: new Stripe('sk_test_placeholder').webhooks,
  };
  const database = { query: async (sql,params=[]) => (await db.query(sql,params)).rows,
    transaction: async work => db.transaction(tx => work({query:(sql,params=[])=>tx.query(sql,params)})) };
  const cache = new Map();
  const overrides = {
    'server-only': {},
    'lib/db': database,
    'lib/stripe': { verifiedStripe:()=>stripe,stripeClient:()=>stripe },
    'lib/session': {currentUser:async()=>({id:user,email:'test@example.invalid'})},
    'lib/auth-service': {throttle:async()=>{}},
    'lib/billing-environment': {stripeObjectMatchesMode:live=>live===false,expectedStripeLivemode:()=>false},
    'lib/billing-currency': {resolvePresentmentCurrency:async()=> 'usd',normalizeBillingCurrency:c=>['usd','thb'].includes(c)?c:null,convertUsdCentsToCurrency:(a,c)=>c==='thb'?a*36:a,priceLookupKeyForCurrency:(k,c)=>c==='usd'?k:k+'_'+c},
    'lib/credit-config': {creditPlans:()=>({})},
    'lib/software-refund': {},'lib/software-storefront-fulfillment': {fulfillSoftwareStorefrontPayment:async()=>{}},
    'lib/workspace-credit-pack': {},
    'lib/billing-notices': {queueBillingNotice:async()=>{}},
    'lib/site-url': {sitePath:p=>'https://onefinsolution.net'+p,siteUrl:()=> 'https://onefinsolution.net'},
  };
  function load(name) {
    if(name in overrides)return overrides[name];
    if(cache.has(name))return cache.get(name).exports;
    const mod={exports:{}};cache.set(name,mod);
    const code=ts.transpileModule(readFileSync(resolve(name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const req=specifier=>{
      if(specifier in overrides)return overrides[specifier];
      if(specifier.startsWith('@/'))return load(specifier.slice(2));
      if(specifier.startsWith('.'))return load(relative(process.cwd(),resolve(name,'..',specifier)).replaceAll('\\','/'));
      return require(specifier);
    };
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,process,URL,Response,Request,Buffer,setTimeout,Error})(req,mod,mod.exports);
    return mod.exports;
  }
  function subscription(status='trialing') {
    const start=Math.floor(Date.now()/1000),end=start+86400;
    const sub={id:'sub_test',customer,livemode:false,status,cancel_at_period_end:false,default_payment_method:'pm_saved',trial_end:status==='trialing'?end:null,latest_invoice:'in_zero',metadata:{app:'chatbot-template',billing_scope:'subscription',enrollment_id:enrollmentId},items:{data:[{price:prices[0],quantity:1,current_period_start:start,current_period_end:end}]}};
    subs.push(sub);return sub;
  }
  return {db,calls,sessions,subs,prices,customerObj,methods,stripe,load,subscription,database};
}

test('hosted trial requires card; repeated start reuses session; plan switch expires old checkout', async () => {
  const f=await fixture();try {
    const e=f.load('lib/subscription-enrollment');
    await e.prepareEnrollment(user,'daily','trial');
    const params=f.calls.find(c=>c[0]==='checkout.create')[1];
    assert.equal(params.mode,'subscription');assert.equal(params.payment_method_collection,'always');assert.equal(params.subscription_data.trial_period_days,1);
    assert.equal((await f.db.query('select * from membership_access')).rows.length,0);
    await e.prepareEnrollment(user,'daily','trial');assert.equal(f.sessions.size,1);
    await e.prepareEnrollment(user,'monthly','paid');assert.equal(f.sessions.get('cs_test_session0').status,'expired');
    assert.equal(f.calls.filter(c=>c[0]==='checkout.create')[1][1].subscription_data.trial_period_days,undefined);
  } finally {await f.db.close();}
});

test('completed checkout grants trial once, saves default, rejects foreign and wrong-mode returns', async () => {
  const f=await fixture();try {
    const e=f.load('lib/subscription-enrollment');await e.prepareEnrollment(user,'daily','trial');
    const s=f.sessions.get('cs_test_session0'),sub=f.subscription();sub.metadata.enrollment_id=s.metadata.enrollment_id;
    Object.assign(s,{status:'complete',payment_status:'no_payment_required',subscription:sub.id});
    assert.equal((await e.completeEnrollment(user,s.id)).status,'complete');
    await e.completeEnrollment(user,s.id);
    assert.equal((await f.db.query('select * from billing_trial_claims')).rows.length,1);
    assert.equal((await f.db.query('select * from membership_access')).rows.length,1);
    assert.equal(f.customerObj.invoice_settings.default_payment_method,'pm_saved');
    s.metadata.user_id='foreign';await assert.rejects(()=>e.completeEnrollment(user,s.id),/Checkout not found/);
    s.metadata.user_id=user;s.livemode=true;await assert.rejects(()=>e.completeEnrollment(user,s.id),/Checkout not found/);
  } finally {await f.db.close();}
});

test('uncompleted checkout grants nothing and used trials cannot be requested again', async () => {
  const f=await fixture();try {
    const e=f.load('lib/subscription-enrollment');await e.prepareEnrollment(user,'daily','trial');
    assert.equal((await e.completeEnrollment(user,'cs_test_session0')).status,'pending');
    assert.equal((await f.db.query('select * from membership_access')).rows.length,0);
    await f.db.query('insert into billing_trial_claims values($1,$2,$3)',[user,'hash',enrollmentId]);
    await assert.rejects(()=>e.prepareEnrollment(user,'weekly','trial'),/already been used/);
  } finally {await f.db.close();}
});

test('card setup updates renewal default once; replay cannot undo a later default; foreign and in-use removal rejected', async () => {
  const f=await fixture();try {
    const sub=f.subscription();sub.default_payment_method=null;
    const actions=f.load('app/payment-method-actions');await actions.addSubscriptionPaymentMethodAction();
    const s=f.sessions.get('cs_test_session0');assert.equal(s.mode,'setup');assert.equal(s.payment_intent_data,undefined);
    Object.assign(s,{status:'complete',payment_status:'no_payment_required',setup_intent:'seti_saved'});
    const e=f.load('lib/subscription-enrollment');assert.equal((await e.completeEnrollment(user,s.id)).status,'complete');
    assert.equal(sub.default_payment_method,'pm_saved');
    assert.equal((await f.db.query('select * from membership_access')).rows.length,1);
    assert.equal((await actions.setDefaultPaymentMethodAction('pm_other')).success,true);
    await e.completeEnrollment(user,s.id);assert.equal(sub.default_payment_method,'pm_other');
    assert.match((await actions.detachPaymentMethodAction('pm_other')).error,/another default/);
    assert.match((await actions.setDefaultPaymentMethodAction('pm_foreign')).error,/not available/);
    assert.equal((await actions.detachPaymentMethodAction('pm_saved')).success,true);
  } finally {await f.db.close();}
});

test('upgrade/downgrade scheduled at renewal without proration, remove schedule, cancel and reactivate', async () => {
  const f=await fixture();try {
    const sub=f.subscription('active');const b=f.load('lib/stripe-billing');
    await f.load('lib/stripe-fulfillment').fulfillStripeEvent(f.stripe,{type:'customer.subscription.updated',livemode:false,data:{object:{id:sub.id}}});
    await b.schedulePlanChange('yearly');
    let change=f.calls.filter(c=>c[0]==='schedule.update').at(-1)[1];
    assert.equal(change.phases[1].items[0].price,'price_yearly');assert.equal(change.phases[0].end_date,sub.items.data[0].current_period_end);assert.equal(change.proration_behavior,'none');
    sub.items.data[0].price=f.prices[3];await b.schedulePlanChange('weekly');
    change=f.calls.filter(c=>c[0]==='schedule.update').at(-1)[1];assert.equal(change.phases[1].items[0].price,'price_weekly');
    await b.schedulePlanChange('yearly');assert.equal(sub.schedule,null);
    await b.schedulePlanChange('monthly');
    const billing=b.createStripeBilling();assert.equal((await billing.updateSubscription(sub.id,{cancel_at_period_end:true})).error,null);
    assert.equal(sub.cancel_at_period_end,true);assert.equal(sub.schedule,null);
    assert.equal((await f.db.query('select next_plan_key from billing_subscriptions')).rows[0].next_plan_key,null);
    await assert.rejects(()=>b.schedulePlanChange('daily'),/Reactivate/);
    assert.equal((await billing.updateSubscription(sub.id,{cancel_at_period_end:false})).error,null);assert.equal(sub.cancel_at_period_end,false);
  } finally {await f.db.close();}
});

test('signed webhook processes and deduplicates; invalid signatures and wrong mode rejected', async () => {
  const f=await fixture();const oldSecret=process.env.STRIPE_WEBHOOK_SECRET,oldKey=process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_WEBHOOK_SECRET='whsec_subscription_unit_test';process.env.STRIPE_SECRET_KEY='sk_test_placeholder';
    const sub=f.subscription();const route=f.load('app/api/stripe/webhook/route');
    const event={id:'evt_subscription_test',type:'customer.subscription.updated',livemode:false,data:{object:{id:sub.id}}};
    function request(body,valid=true){const payload=JSON.stringify(body);return new Request('https://onefinsolution.net/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':valid?f.stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET}):'bad'},body:payload});}
    assert.equal((await route.POST(request(event,false))).status,400);
    assert.equal((await route.POST(request({...event,livemode:true}))).status,400);
    assert.equal((await route.POST(request(event))).status,200);assert.equal((await route.POST(request(event))).status,200);
    const row=(await f.db.query('select status,attempts from stripe_webhook_events')).rows[0];assert.equal(row.status,'processed');assert.equal(row.attempts,1);
  } finally { if(oldSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=oldSecret;if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;await f.db.close(); }
});
