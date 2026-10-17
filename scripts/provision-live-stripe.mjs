/**
 * Provision LIVE Stripe catalog for production:
 * - Personal subscription products/prices (onefin_v2_* lookup keys, THB)
 * - Ensure workspace credit packs exist (or keep existing live prices)
 * - Ensure webhook endpoints for .net and .online
 *
 * Usage:
 *   node scripts/provision-live-stripe.mjs           # dry-run
 *   node scripts/provision-live-stripe.mjs --apply   # create/update
 *
 * Requires local sk_live_ key in .env / .env.local.
 * Never prints secret values.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Stripe from 'stripe';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes('--apply');

function loadExtraEnv() {
  for (const f of ['.env.stripe-generated']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}
loadExtraEnv();

const key = process.env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_live_')) {
  throw new Error('STRIPE_SECRET_KEY must be sk_live_ for this provisioner.');
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://onefinsolution.net').replace(/\/$/, '');
const expectedAccount = process.env.STRIPE_EXPECTED_ACCOUNT_ID || '';
const currency = (process.env.BILLING_CURRENCY || 'thb').toLowerCase();

const stripe = new Stripe(key, {
  apiVersion: '2026-09-30.endive',
  typescript: true,
});

// App plan definitions (amounts in smallest currency unit — satang for THB)
const personalPlans = [
  { key: 'daily', name: 'Daily', amount: 500, interval: 'day', trialDays: 1 },
  { key: 'weekly', name: 'Weekly', amount: 1300, interval: 'week', trialDays: 3 },
  { key: 'monthly', name: 'Monthly', amount: 3500, interval: 'month', trialDays: 7 },
  { key: 'yearly', name: 'Yearly', amount: 30000, interval: 'year', trialDays: 7 },
];

// Default credit packs if none exist in live (THB)
const defaultCreditPacks = [
  { code: 'credits_100', name: '100 Chat Credits', credits: 100, amount: 9900 },
  { code: 'credits_500', name: '500 Chat Credits', credits: 500, amount: 39900 },
  { code: 'credits_1500', name: '1,500 Chat Credits', credits: 1500, amount: 99900 },
];

const webhookEvents = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'charge.refunded',
  'charge.dispute.created',
];

const webhookUrls = [
  `${siteUrl}/api/stripe/webhook`,
  'https://onefinsolution.online/api/stripe/webhook',
];

const account = await stripe.accounts.retrieve();
const balance = await stripe.balance.retrieve();

if (!balance.livemode) {
  throw new Error('Key is not live mode.');
}
if (expectedAccount && account.id !== expectedAccount) {
  throw new Error(`Account mismatch: got ${account.id}, expected ${expectedAccount}`);
}
if (!account.charges_enabled) {
  console.warn('WARN: charges_enabled=false — complete Stripe activation before taking payments.');
}

console.log(
  JSON.stringify(
    {
      apply,
      account: account.id,
      country: account.country,
      currency: account.default_currency,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      siteUrl,
      billingCurrency: currency,
    },
    null,
    2,
  ),
);

const personalPriceIds = {};
const personalLookups = {};
const creditPlans = {};
const creditIds = {};

// --- Personal subscription product ---
{
  const products = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 500 });
  let product =
    products.find(
      (p) =>
        p.metadata?.app === 'chatbot-template' &&
        p.metadata?.business_system === 'subscriptions' &&
        p.metadata?.catalog_version === 'live_v1',
    ) ||
    products.find(
      (p) =>
        p.metadata?.app === 'chatbot-template' &&
        p.metadata?.business_system === 'subscriptions',
    );

  if (!product) {
    console.log('personal_product: will create');
    if (apply) {
      product = await stripe.products.create(
        {
          name: 'OneFin Chat Subscription',
          description: 'Personal chat subscription plans for One Fin Solution.',
          metadata: {
            app: 'chatbot-template',
            business_system: 'subscriptions',
            catalog_version: 'live_v1',
          },
        },
        { idempotencyKey: 'onefin-live-sub-product-v1' },
      );
    }
  } else {
    console.log('personal_product: exists', product.id);
  }

  for (const plan of personalPlans) {
    const lookup = `onefin_v2_${plan.key}`;
    personalLookups[plan.key] = lookup;
    const existing = await stripe.prices.list({
      lookup_keys: [lookup],
      active: true,
      limit: 2,
    });
    if (existing.data.length > 1) {
      throw new Error(`Duplicate lookup key ${lookup}`);
    }
    let price = existing.data[0];
    if (price) {
      // Validate shape; if wrong amount/currency, create new and reassign lookup
      const ok =
        price.currency === currency &&
        price.unit_amount === plan.amount &&
        price.recurring?.interval === plan.interval &&
        price.type === 'recurring';
      if (!ok) {
        console.log(
          'personal_price_mismatch',
          lookup,
          {
            currency: price.currency,
            amount: price.unit_amount,
            interval: price.recurring?.interval,
          },
          'expected',
          plan,
        );
        if (apply) {
          // Clear lookup from old price then create new
          await stripe.prices.update(price.id, { lookup_key: null, active: false });
          price = await stripe.prices.create(
            {
              product: product.id,
              currency,
              unit_amount: plan.amount,
              recurring: { interval: plan.interval },
              lookup_key: lookup,
              metadata: {
                app: 'chatbot-template',
                business_system: 'subscriptions',
                plan_key: plan.key,
                trial_days: String(plan.trialDays),
                catalog_version: 'live_v1',
              },
            },
            { idempotencyKey: `onefin-live-sub-price-v2:${plan.key}:${currency}:${plan.amount}` },
          );
        } else {
          price = null;
        }
      }
    } else if (apply) {
      if (!product) throw new Error('Product missing in apply path');
      price = await stripe.prices.create(
        {
          product: product.id,
          currency,
          unit_amount: plan.amount,
          recurring: { interval: plan.interval },
          lookup_key: lookup,
          metadata: {
            app: 'chatbot-template',
            business_system: 'subscriptions',
            plan_key: plan.key,
            trial_days: String(plan.trialDays),
            catalog_version: 'live_v1',
          },
        },
        { idempotencyKey: `onefin-live-sub-price-v1:${plan.key}:${currency}:${plan.amount}` },
      );
    }

    if (price) {
      personalPriceIds[plan.key] = price.id;
      console.log('personal_price', plan.key, price.id, price.currency, price.unit_amount, price.recurring?.interval);
    } else {
      console.log('personal_price_pending', plan.key, lookup);
    }
  }
}

// --- Credit packs ---
{
  // Keep any live prices already referenced in env
  if (process.env.STRIPE_CREDIT_PLANS) {
    try {
      const existing = JSON.parse(process.env.STRIPE_CREDIT_PLANS);
      for (const [id, cfg] of Object.entries(existing)) {
        try {
          const price = await stripe.prices.retrieve(id);
          if (price.active && price.livemode) {
            creditPlans[id] = cfg;
            console.log('credit_keep', id, cfg);
          }
        } catch {
          console.log('credit_stale', id);
        }
      }
    } catch {
      console.log('credit_env_parse_fail');
    }
  }

  // Discover existing managed credit prices
  const allPrices = await stripe.prices.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 2000 });
  for (const p of allPrices) {
    if (!p.livemode || p.type !== 'one_time') continue;
    const meta = p.metadata || {};
    const credits = Number(meta.credits || 0);
    if (
      credits > 0 &&
      (meta.business_system === 'workspace_credits' ||
        meta.app === 'chatbot-template' ||
        String(p.lookup_key || '').includes('credit') ||
        String(p.lookup_key || '').includes('chatbot'))
    ) {
      creditPlans[p.id] = { credits, kind: 'pack' };
      if (meta.item_code) creditIds[meta.item_code] = p.id;
      console.log('credit_found', p.id, p.lookup_key, credits, p.currency, p.unit_amount);
    }
  }

  if (Object.keys(creditPlans).length === 0) {
    console.log('credit_packs: none found — will create defaults');
    let product = (
      await stripe.products.list({ active: true, limit: 100 })
    ).data.find(
      (p) =>
        p.metadata?.app === 'chatbot-template' &&
        p.metadata?.business_system === 'workspace_credits',
    );
    if (!product && apply) {
      product = await stripe.products.create(
        {
          name: 'OneFin Workspace Credits',
          description: 'One-time chat credit packs.',
          metadata: {
            app: 'chatbot-template',
            business_system: 'workspace_credits',
            catalog_version: 'live_v1',
          },
        },
        { idempotencyKey: 'onefin-live-credits-product-v1' },
      );
    }
    for (const pack of defaultCreditPacks) {
      const lookup = `onefin_live_credits_${pack.code}`;
      const listed = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
      let price = listed.data[0];
      if (!price && apply && product) {
        price = await stripe.prices.create(
          {
            product: product.id,
            currency,
            unit_amount: pack.amount,
            lookup_key: lookup,
            metadata: {
              app: 'chatbot-template',
              business_system: 'workspace_credits',
              item_code: pack.code,
              credits: String(pack.credits),
              catalog_version: 'live_v1',
            },
          },
          { idempotencyKey: `onefin-live-credit-price-v1:${pack.code}` },
        );
      }
      if (price) {
        creditPlans[price.id] = { credits: pack.credits, kind: 'pack' };
        creditIds[pack.code] = price.id;
        console.log('credit_price', pack.code, price.id, price.unit_amount);
      } else {
        console.log('credit_price_pending', pack.code);
      }
    }
  }
}

// --- Software catalog: keep env entries that exist in live ---
let softwareCatalog = {};
if (process.env.STRIPE_SOFTWARE_CATALOG) {
  try {
    const existing = JSON.parse(process.env.STRIPE_SOFTWARE_CATALOG);
    for (const [code, cfg] of Object.entries(existing)) {
      try {
        const price = await stripe.prices.retrieve(cfg.priceId);
        if (price.livemode && price.active) {
          softwareCatalog[code] = cfg;
          console.log('software_keep', code, cfg.priceId);
        } else {
          console.log('software_skip_not_live', code);
        }
      } catch {
        console.log('software_stale', code, cfg.priceId);
      }
    }
  } catch {
    console.log('software_parse_fail');
  }
}

// --- Webhooks ---
let primarySecret = process.env.STRIPE_WEBHOOK_SECRET || '';
let primaryEndpointId = process.env.STRIPE_WEBHOOK_ENDPOINT_ID || '';
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });

for (const url of webhookUrls) {
  let endpoint = endpoints.data.find((e) => e.url === url);
  if (endpoint) {
    console.log('webhook_exists', endpoint.id, url, endpoint.status);
    if (apply) {
      const have = new Set(endpoint.enabled_events || []);
      if (
        !(endpoint.enabled_events || []).includes('*') &&
        webhookEvents.some((e) => !have.has(e))
      ) {
        endpoint = await stripe.webhookEndpoints.update(endpoint.id, {
          enabled_events: [...new Set([...(endpoint.enabled_events || []), ...webhookEvents])],
          metadata: { ...(endpoint.metadata || {}), app: 'chatbot-template', env: 'production' },
        });
        console.log('webhook_events_updated', endpoint.id);
      }
      if (endpoint.status !== 'enabled') {
        console.warn('WARN webhook not enabled', endpoint.id, endpoint.status);
      }
    }
    if (url.includes(new URL(siteUrl).host)) primaryEndpointId = endpoint.id;
  } else if (apply) {
    console.log('webhook_create', url);
    endpoint = await stripe.webhookEndpoints.create(
      {
        url,
        enabled_events: webhookEvents,
        metadata: { app: 'chatbot-template', env: 'production' },
      },
      { idempotencyKey: `onefin-live-webhook-v1:${url}` },
    );
    console.log('webhook_created', endpoint.id, 'secret_returned', Boolean(endpoint.secret));
    if (endpoint.secret) {
      // Prefer .net secret as primary
      if (url.includes(new URL(siteUrl).host) || !primarySecret.startsWith('whsec_')) {
        primarySecret = endpoint.secret;
        primaryEndpointId = endpoint.id;
      }
    }
  } else {
    console.log('webhook_missing', url);
  }
}

const snapshot = {
  accountId: account.id,
  mode: 'live',
  currency,
  prices: personalPriceIds,
  lookups: personalLookups,
  creditPlans,
  creditIds,
  softwareCatalog,
  webhookId: primaryEndpointId || null,
  webhookUrls,
  site: siteUrl,
  charges_enabled: account.charges_enabled,
  payouts_enabled: account.payouts_enabled,
};

writeFileSync(
  new URL('../.stripe-live-ids.json', import.meta.url),
  JSON.stringify(snapshot, null, 2) + '\n',
);
console.log('wrote .stripe-live-ids.json');

// billing/personal-plan-ids.json used by app fallback
writeFileSync(
  new URL('../billing/personal-plan-ids.json', import.meta.url),
  JSON.stringify(
    {
      accountId: account.id,
      mode: 'live',
      prices: personalPriceIds,
      lookups: personalLookups,
      site: siteUrl,
    },
    null,
    2,
  ) + '\n',
);
console.log('wrote billing/personal-plan-ids.json');

if (primarySecret.startsWith('whsec_')) {
  writeFileSync(
    new URL('../.env.stripe-generated', import.meta.url),
    [
      `STRIPE_WEBHOOK_SECRET=${primarySecret}`,
      `STRIPE_WEBHOOK_ENDPOINT_ID=${primaryEndpointId || ''}`,
      'STRIPE_MODE=live',
      `STRIPE_EXPECTED_ACCOUNT_ID=${account.id}`,
      `STRIPE_PERSONAL_PLAN_PRICE_IDS=${JSON.stringify(personalPriceIds)}`,
      `STRIPE_CREDIT_PLANS=${JSON.stringify(creditPlans)}`,
      `STRIPE_SOFTWARE_CATALOG=${JSON.stringify(softwareCatalog)}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('updated .env.stripe-generated (webhook secret + catalogs)');
} else if (apply) {
  // still write catalogs without rotating webhook secret
  const prev = existsSync('.env.stripe-generated')
    ? readFileSync('.env.stripe-generated', 'utf8')
    : '';
  const prevSecret = (prev.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m) || [])[1] || '';
  writeFileSync(
    '.env.stripe-generated',
    [
      prevSecret ? `STRIPE_WEBHOOK_SECRET=${prevSecret}` : '',
      primaryEndpointId ? `STRIPE_WEBHOOK_ENDPOINT_ID=${primaryEndpointId}` : '',
      'STRIPE_MODE=live',
      `STRIPE_EXPECTED_ACCOUNT_ID=${account.id}`,
      `STRIPE_PERSONAL_PLAN_PRICE_IDS=${JSON.stringify(personalPriceIds)}`,
      `STRIPE_CREDIT_PLANS=${JSON.stringify(creditPlans)}`,
      `STRIPE_SOFTWARE_CATALOG=${JSON.stringify(softwareCatalog)}`,
      '',
    ]
      .filter(Boolean)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log('updated .env.stripe-generated catalogs (kept prior webhook secret)');
}

console.log(
  'summary',
  JSON.stringify({
    personalPlans: Object.keys(personalPriceIds).length,
    creditPlans: Object.keys(creditPlans).length,
    software: Object.keys(softwareCatalog).length,
    webhookSecret: primarySecret.startsWith('whsec_'),
    webhookId: primaryEndpointId,
    apply,
  }),
);

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to create/update live Stripe objects.');
}
