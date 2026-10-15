import Stripe from 'stripe';
import { readFileSync, writeFileSync } from 'node:fs';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes('--apply');
const key = process.env.STRIPE_SECRET_KEY;
if (!key || !/^(sk|rk)_test_/.test(key)) throw new Error('Provide a Stripe Test Mode key through the environment or ignored .env.local.');
if (!process.env.STRIPE_EXPECTED_ACCOUNT_ID) throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required.');
if (!process.env.NEXT_PUBLIC_SITE_URL) throw new Error('NEXT_PUBLIC_SITE_URL is required.');
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash) {
  throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS site origin.');
}
const stripe = new Stripe(key);
const [account, balance] = await Promise.all([stripe.accounts.retrieve(null), stripe.balance.retrieve()]);
if (account.id !== process.env.STRIPE_EXPECTED_ACCOUNT_ID || balance.livemode) throw new Error('Wrong Stripe account or mode.');
const catalog = JSON.parse(readFileSync(new URL('../billing/test-catalog.json', import.meta.url), 'utf8'));
if (catalog.products.some(product => product.prices.some(price => price.interval))) {
  throw new Error('This provisioner accepts Workspace one-time credit packs only. Provision chat subscription prices separately.');
}
console.log(JSON.stringify({ account: account.id, mode: 'test', apply, products: catalog.products }, null, 2));
if (!apply) process.exit(0);

const inventory = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 10000 });
const plans = {};
const ids = {};
for (const definition of catalog.products) {
  const matches = inventory.filter(product => product.metadata.app === 'chatbot-template' && product.metadata.item_code === definition.code);
  if (matches.length > 1) throw new Error(`Duplicate managed product: ${definition.code}`);
  const product = matches[0] || await stripe.products.create({ name: definition.name, description: definition.description,
    metadata: { app: 'chatbot-template', item_code: definition.code, catalog_version: '1' },
  }, { idempotencyKey: `chatbot-test-product-v1:${definition.code}` });
  if (product.livemode || product.name !== definition.name || product.description !== definition.description) throw new Error(`Managed product differs from catalog: ${definition.code}`);
  for (const price of definition.prices) {
    const lookup = `chatbot_test_v1_${price.code}`;
    const existing = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 2 });
    if (existing.data.length > 1) throw new Error(`Duplicate managed price: ${lookup}`);
    const value = existing.data[0] || await stripe.prices.create({ product: product.id, unit_amount: price.amount, currency: 'usd', lookup_key: lookup,
      ...(price.interval ? { recurring: { interval: price.interval } } : {}),
      metadata: { app: 'chatbot-template', business_system: 'workspace_credits', item_code: price.code, credits: String(price.credits), catalog_version: '1' },
    }, { idempotencyKey: `chatbot-test-price-v1:${price.code}` });
    if (value.livemode || value.product !== product.id || value.unit_amount !== price.amount || value.currency !== 'usd' ||
      (value.recurring?.interval || null) !== (price.interval || null) || value.metadata.credits !== String(price.credits)) throw new Error(`Managed price differs: ${lookup}`);
    plans[value.id] = { credits: price.credits, kind: 'pack' };
    ids[price.code] = { productId: product.id, priceId: value.id, amount: price.amount, currency: 'usd', interval: price.interval || null, credits: price.credits };
  }
}
const url = `${site.origin}/api/stripe/webhook`;
const events = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.trial_will_end'];
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let endpoint = endpoints.data.find(endpoint => endpoint.url === url);
if (endpoint) {
  if (endpoint.livemode || endpoint.metadata.app !== 'chatbot-template') throw new Error('Existing webhook is not managed by this application.');
  if (endpoint.status !== 'enabled') throw new Error('Managed webhook is not enabled.');
  if (!events.every(event => endpoint.enabled_events.includes(event))) {
    endpoint = await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: [...new Set([...endpoint.enabled_events, ...events])] });
  }
} else {
  endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: events, metadata: { app: 'chatbot-template' } }, { idempotencyKey: 'chatbot-test-webhook-v1' });
  // Preserve the one-time signing secret in a gitignored file; never log it.
  writeFileSync(new URL('../.env.stripe-generated', import.meta.url), `STRIPE_WEBHOOK_SECRET=${endpoint.secret}\n`, { flag: 'wx', mode: 0o600 });
}
writeFileSync(new URL('../.stripe-test-ids.json', import.meta.url), JSON.stringify({ accountId: account.id, mode: 'test', prices: ids, webhookId: endpoint.id, webhookUrl: url }, null, 2) + '\n');
console.log('Catalog verified. Set BILLING_PROVIDER=stripe and STRIPE_CREDIT_PLANS to:');
console.log(JSON.stringify(plans));
console.log('Signing secret, when newly created, is stored only in ignored .env.stripe-generated.');
