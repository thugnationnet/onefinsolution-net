import Stripe from 'stripe';
import nextEnv from '@next/env';
import {writeFileSync} from 'node:fs';

// Inlined from lib/plans.ts so this script runs under plain Node (no TS loader).
// Keep amounts/keys/intervals/trials identical to lib/plans.ts business logic.
const plans = [
  { key: 'daily', name: 'Daily', amount: 500, interval: 'day', trialDays: 1 },
  { key: 'weekly', name: 'Weekly', amount: 1300, interval: 'week', trialDays: 3 },
  { key: 'monthly', name: 'Monthly', amount: 3000, interval: 'month', trialDays: 5 },
  { key: 'yearly', name: 'Yearly', amount: 24900, interval: 'year', trialDays: 15 },
];
const lookupKey = (key) => {
  const plan = plans.find((value) => value.key === key);
  if (!plan) throw new Error('Choose an available plan.');
  return `onefin_v2_${plan.key}`;
};

nextEnv.loadEnvConfig(process.cwd());
const apply=process.argv.includes('--apply');
if(!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY||''))throw new Error('A configured test key is required.');
if(!process.env.STRIPE_EXPECTED_ACCOUNT_ID)throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required.');
if(!process.env.NEXT_PUBLIC_SITE_URL)throw new Error('NEXT_PUBLIC_SITE_URL is required.');
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const [account,balance]=await Promise.all([stripe.accounts.retrieve(null),stripe.balance.retrieve()]);
if(account.id!==process.env.STRIPE_EXPECTED_ACCOUNT_ID||balance.livemode)throw new Error('Wrong account or mode.');
const url=new URL(process.env.NEXT_PUBLIC_SITE_URL);
if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS site origin.');
const products=await stripe.products.list({active:true,limit:100}).autoPagingToArray({limit:10000});
const matches=products.filter(product=>product.metadata.app==='chatbot-template'&&product.metadata.item_code==='personal_v2');
if(matches.length>1)throw new Error('Duplicate managed product.');
const prices=await Promise.all(plans.map(plan=>stripe.prices.list({lookup_keys:[lookupKey(plan.key)],limit:2})));
for(let i=0;i<plans.length;i++){const price=prices[i].data[0],plan=plans[i];if(prices[i].data.length>1||(price&&(price.livemode||!price.active||price.unit_amount!==plan.amount||price.currency!=='usd'||price.recurring?.interval!==plan.interval||price.recurring.interval_count!==1||price.metadata.app!=='chatbot-template'||price.product!==matches[0]?.id)))throw new Error('Managed price conflict.');}
const endpoints=await stripe.webhookEndpoints.list({limit:100}).autoPagingToArray({limit:1000});
const hooks=endpoints.filter(endpoint=>endpoint.url===`${url.origin}/api/stripe/webhook`);
if(hooks.length!==1||hooks[0].livemode||hooks[0].metadata.app!=='chatbot-template'||hooks[0].status!=='enabled')throw new Error('Expected one enabled One Fin sandbox webhook.');
const events=['customer.subscription.trial_will_end','invoice.payment_failed','invoice.payment_action_required'];
console.log(JSON.stringify({account:account.id,mode:'test',apply,plans:plans.map(plan=>({key:plan.key,amount:plan.amount,interval:plan.interval,trialDays:plan.trialDays})),newProduct:!matches.length,newPrices:prices.filter(result=>!result.data.length).length,webhookEventsToAdd:events.filter(event=>!hooks[0].enabled_events.includes(event))},null,2));
if(!apply)process.exit(0);
const product=matches[0]||await stripe.products.create({name:'One Fin Personal',description:'Unlimited responses during an active personal membership.',metadata:{app:'chatbot-template',item_code:'personal_v2'}},{idempotencyKey:'onefin-personal-product-v2'});
const saved={};
for(let i=0;i<plans.length;i++){const plan=plans[i];const price=prices[i].data[0]||await stripe.prices.create({product:product.id,currency:'usd',unit_amount:plan.amount,recurring:{interval:plan.interval},lookup_key:lookupKey(plan.key),metadata:{app:'chatbot-template',plan_key:plan.key,catalog_version:'2'}},{idempotencyKey:`onefin-price-v2:${plan.key}`});saved[plan.key]=price.id;}
if(!hooks[0].enabled_events.includes('*'))await stripe.webhookEndpoints.update(hooks[0].id,{enabled_events:[...new Set([...hooks[0].enabled_events,...events])]});
writeFileSync(new URL('../billing/personal-plan-ids.json',import.meta.url),JSON.stringify({accountId:account.id,mode:'test',prices:saved},null,2)+'\n');
writeFileSync(new URL('../.stripe-plan-ids.json',import.meta.url),JSON.stringify({accountId:account.id,mode:'test',prices:saved,lookupKeys:Object.fromEntries(plans.map(p=>[p.key,lookupKey(p.key)]))},null,2)+'\n');
console.log('Personal prices and webhook events verified. Existing prices and subscriptions were preserved.');
console.log(JSON.stringify({prices:Object.fromEntries(Object.entries(saved).map(([k,v])=>[k,String(v).slice(0,12)+'…']))},null,2));
