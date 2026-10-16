/**
 * Idempotent Stripe Test-mode catalog provisioner for all three payment modules.
 * Usage: node scripts/provision-payment-catalog.mjs --apply
 *
 * Creates/verifies:
 *  - Subscription prices with lookup keys onefin_v2_{daily,weekly,monthly,yearly}
 *  - Workspace credit pack price(s) from billing/test-catalog.json
 *  - Software storefront one-time prices for templates + software catalog items
 *
 * Writes:
 *  - billing/personal-plan-ids.json
 *  - .env.stripe-generated (gitignored helper)
 * Does NOT print full secrets.
 */
import Stripe from 'stripe';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes('--apply');
const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_BASE_URL || 'https://onefinsolution.net';
const key = process.env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
  console.error('STRIPE_SECRET_KEY missing or invalid');
  process.exit(1);
}
if (process.env.STRIPE_MODE === 'live' || key.startsWith('sk_live_')) {
  console.error('Refusing to provision against live mode in this script.');
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });

const SUB_PLANS = [
  { key: 'daily', name: 'Daily', amount: 500, interval: 'day', trialDays: 1 },
  { key: 'weekly', name: 'Weekly', amount: 1300, interval: 'week', trialDays: 3 },
  { key: 'monthly', name: 'Monthly', amount: 3000, interval: 'month', trialDays: 5 },
  { key: 'yearly', name: 'Yearly', amount: 24900, interval: 'year', trialDays: 15 },
];

function parseCatalogItems(path, kind) {
  const src = readFileSync(path, 'utf8');
  const out = [];
  for (const part of src.split(/\{\s*\n/)) {
    const id = (part.match(/\bid:\s*['"]([^'"]+)['"]/) || [])[1];
    if (!id) continue;
    const name = (part.match(/\bname:\s*['"]([^'"]+)['"]/) || [])[1] || id;
    const priceMatch = part.match(/\bprice(?:Usd)?:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!priceMatch) continue;
    out.push({ kind, id, name, priceUsd: Number(priceMatch[1]) });
  }
  const map = new Map();
  for (const item of out) map.set(`${kind}:${item.id}`, item);
  return [...map.values()];
}

async function ensureProduct({ name, metadata }) {
  const existing = await stripe.products.search({
    query: `name:'${name.replace(/'/g, "\\'")}' AND active:'true'`,
    limit: 5,
  }).catch(() => null);

  if (existing?.data?.length) {
    const hit = existing.data.find((p) => p.metadata?.app === metadata.app) || existing.data[0];
    return hit;
  }

  // fallback list scan (search may be unavailable)
  const listed = await stripe.products.list({ limit: 100, active: true });
  const hit = listed.data.find(
    (p) => p.name === name && (!metadata.app || p.metadata?.app === metadata.app),
  );
  if (hit) return hit;

  if (!apply) {
    return { id: 'prod_dry_run', name, metadata };
  }
  return stripe.products.create({ name, metadata });
}

async function findPriceByLookupKey(lookupKey) {
  // list + filter (lookup_key retrieve via prices.list doesn't filter by key in all API versions)
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 10, active: true });
  return prices.data[0] || null;
}

async function ensureRecurringPrice({ productId, unitAmount, interval, lookupKey, metadata, nickname }) {
  const existing = await findPriceByLookupKey(lookupKey);
  if (existing) {
    const ok =
      existing.unit_amount === unitAmount &&
      existing.recurring?.interval === interval &&
      existing.product === productId;
    if (!ok) {
      console.warn(
        `WARN lookup ${lookupKey} exists as ${existing.id} amount=${existing.unit_amount} interval=${existing.recurring?.interval} product=${existing.product}`,
      );
    }
    return existing;
  }
  if (!apply) {
    return { id: `price_dry_${lookupKey}`, lookup_key: lookupKey, unit_amount: unitAmount };
  }
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    nickname,
    metadata,
  });
}

async function ensureOneTimePrice({ productId, unitAmount, lookupKey, metadata, nickname }) {
  if (lookupKey) {
    const existing = await findPriceByLookupKey(lookupKey);
    if (existing) return existing;
  }
  // match by product + amount + one_time
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  const hit = listed.data.find(
    (p) => p.unit_amount === unitAmount && !p.recurring && p.currency === 'usd',
  );
  if (hit) return hit;

  if (!apply) {
    return { id: `price_dry_${lookupKey || unitAmount}`, unit_amount: unitAmount };
  }
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: unitAmount,
    lookup_key: lookupKey || undefined,
    nickname,
    metadata,
  });
}

function report(label, obj) {
  console.log(label, obj);
}

async function main() {
  const account = await stripe.accounts.retrieve();
  report('account', { id: account.id, mode: 'test' });

  const expected = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
  if (expected && expected !== account.id) {
    console.error(`Account mismatch: expected ${expected}, got ${account.id}`);
    process.exit(1);
  }

  // ---- Subscriptions ----
  const subProduct = await ensureProduct({
    name: 'OneFin Chat Subscription',
    metadata: { app: 'chatbot-template', system: 'subscription' },
  });
  report('subscription_product', subProduct.id);

  const subPrices = {};
  const subLookups = {};
  for (const plan of SUB_PLANS) {
    const lookup = `onefin_v2_${plan.key}`;
    const price = await ensureRecurringPrice({
      productId: subProduct.id,
      unitAmount: plan.amount,
      interval: plan.interval,
      lookupKey: lookup,
      nickname: `OneFin ${plan.name}`,
      metadata: {
        app: 'chatbot-template',
        system: 'subscription',
        plan_key: plan.key,
        trial_days: String(plan.trialDays),
      },
    });
    subPrices[plan.key] = price.id;
    subLookups[plan.key] = lookup;
    report('subscription_price', {
      key: plan.key,
      priceId: price.id,
      lookup,
      amount: plan.amount,
      interval: plan.interval,
      trialDays: plan.trialDays,
    });
  }

  // ---- Workspace credits ----
  const creditCatalog = JSON.parse(readFileSync('billing/test-catalog.json', 'utf8'));
  const creditPlansEnv = {};
  for (const productDef of creditCatalog.products || []) {
    const product = await ensureProduct({
      name: productDef.name,
      metadata: {
        app: 'chatbot-template',
        system: 'workspace_credits',
        item_code: productDef.code,
        code: productDef.code,
      },
    });
    for (const priceDef of productDef.prices || []) {
      const unitAmount = Number(priceDef.amount ?? priceDef.unitAmount);
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error(`Invalid credit price amount for ${productDef.code}`);
      }
      const lookup = `onefin_credits_${priceDef.credits}`;
      const price = await ensureOneTimePrice({
        productId: product.id,
        unitAmount,
        lookupKey: lookup,
        nickname: `${priceDef.credits} Credits`,
        metadata: {
          app: 'chatbot-template',
          system: 'workspace_credits',
          business_system: 'workspace_credits',
          item_code: String(priceDef.code || productDef.code),
          credits: String(priceDef.credits),
          kind: 'pack',
        },
      });
      creditPlansEnv[price.id] = { credits: priceDef.credits, kind: 'pack' };
      report('credit_price', {
        code: productDef.code,
        priceId: price.id,
        lookup,
        unitAmount,
        credits: priceDef.credits,
      });
    }
  }

  // ---- Software storefront ----
  const softwareItems = [
    ...parseCatalogItems('app/software/src/data/templatesData.ts', 'template'),
    ...parseCatalogItems('app/software/src/data/catalog.ts', 'software'),
  ];
  const softwareCatalogEnv = {};
  for (const item of softwareItems) {
    const amountCents = Math.round(item.priceUsd * 100);
    const product = await ensureProduct({
      name: `OneFin ${item.kind}: ${item.name}`,
      metadata: {
        app: 'onefin-software-store',
        system: 'software',
        item_kind: item.kind,
        item_id: item.id,
      },
    });
    const lookup = `onefin_sw_${item.kind}_${item.id}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 200);
    const price = await ensureOneTimePrice({
      productId: product.id,
      unitAmount: amountCents,
      lookupKey: lookup,
      nickname: item.name.slice(0, 40),
      metadata: {
        app: 'onefin-software-store',
        system: 'software',
        item_kind: item.kind,
        item_id: item.id,
      },
    });
    const key = `${item.kind}:${item.id}`;
    softwareCatalogEnv[key] = {
      productId: product.id,
      priceId: price.id,
      amountCents,
    };
    report('software_price', {
      key,
      priceId: price.id,
      productId: product.id,
      amountCents,
      lookup,
    });
  }

  const planIds = {
    accountId: account.id,
    mode: 'test',
    prices: subPrices,
    lookups: subLookups,
    site,
  };

  const generated = {
    STRIPE_EXPECTED_ACCOUNT_ID: account.id,
    STRIPE_MODE: 'test',
    STRIPE_CREDIT_PLANS: JSON.stringify(creditPlansEnv),
    STRIPE_SOFTWARE_CATALOG: JSON.stringify(softwareCatalogEnv),
    SUBSCRIPTION_PRICE_IDS: subPrices,
  };

  if (apply) {
    writeFileSync('billing/personal-plan-ids.json', JSON.stringify(planIds, null, 2) + '\n');
    writeFileSync('.env.stripe-generated', Object.entries({
      STRIPE_EXPECTED_ACCOUNT_ID: account.id,
      STRIPE_MODE: 'test',
      STRIPE_CREDIT_PLANS: generated.STRIPE_CREDIT_PLANS,
      STRIPE_SOFTWARE_CATALOG: generated.STRIPE_SOFTWARE_CATALOG,
    }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    writeFileSync('.tmp_railway/catalog-provision.json', JSON.stringify({
      accountId: account.id,
      subscription: { productId: subProduct.id, prices: subPrices, lookups: subLookups },
      credits: creditPlansEnv,
      software: softwareCatalogEnv,
    }, null, 2));
    console.log('WROTE billing/personal-plan-ids.json and .env.stripe-generated');
  } else {
    console.log('DRY RUN only. Re-run with --apply to create missing objects and write files.');
  }

  console.log('SUMMARY', JSON.stringify({
    apply,
    accountId: account.id,
    subscriptionPriceIds: subPrices,
    creditPlanCount: Object.keys(creditPlansEnv).length,
    softwareItemCount: Object.keys(softwareCatalogEnv).length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
