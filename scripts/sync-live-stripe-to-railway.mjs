/**
 * Push live Stripe + site production env to Railway.
 * Uses: railway variable set KEY=VALUE
 * Never logs secret values.
 *
 * Usage: node scripts/sync-live-stripe-to-railway.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function loadEnvFiles(files) {
  const env = { ...process.env };
  for (const f of files) {
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
      env[m[1]] = v;
    }
  }
  // Snapshot file may hold catalogs without secrets
  if (existsSync('.stripe-live-ids.json')) {
    try {
      const snap = JSON.parse(readFileSync('.stripe-live-ids.json', 'utf8'));
      if (snap.prices && Object.keys(snap.prices).length) {
        env.STRIPE_PERSONAL_PLAN_PRICE_IDS = JSON.stringify(snap.prices);
      }
      if (snap.creditPlans && Object.keys(snap.creditPlans).length) {
        env.STRIPE_CREDIT_PLANS = JSON.stringify(snap.creditPlans);
      }
      if (snap.softwareCatalog && Object.keys(snap.softwareCatalog).length) {
        env.STRIPE_SOFTWARE_CATALOG = JSON.stringify(snap.softwareCatalog);
      }
      if (snap.accountId) env.STRIPE_EXPECTED_ACCOUNT_ID = snap.accountId;
      if (snap.webhookId) env.STRIPE_WEBHOOK_ENDPOINT_ID = snap.webhookId;
    } catch {
      /* ignore */
    }
  }
  return env;
}

function railwaySet(key, value) {
  // Prefer singular subcommand which works on this CLI version
  const attempts = [
    ['variable', 'set', `${key}=${value}`],
    ['variable', 'set', key, value],
    ['variables', '--set', `${key}=${value}`],
  ];
  for (const args of attempts) {
    const r = spawnSync('railway', args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    if (r.status === 0) {
      return { ok: true };
    }
  }
  const last = spawnSync('railway', ['variable', 'set', `${key}=${value}`], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    ok: false,
    err: ((last.stderr || '') + (last.stdout || '')).slice(0, 400),
  };
}

const env = loadEnvFiles(['.env', '.env.local', '.env.stripe-generated']);

const key = env.STRIPE_SECRET_KEY || '';
const pk = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

if (!key.startsWith('sk_live_')) {
  console.error('Need sk_live_ STRIPE_SECRET_KEY');
  process.exit(1);
}
if (!pk.startsWith('pk_live_')) {
  console.error('Need pk_live_ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  process.exit(1);
}

const out = {
  STRIPE_SECRET_KEY: key,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk,
  STRIPE_MODE: 'live',
  STRIPE_EXPECTED_ACCOUNT_ID:
    env.STRIPE_EXPECTED_ACCOUNT_ID || 'acct_1UQwRyCVjGU3nJVo',
  NEXT_PUBLIC_SITE_URL: 'https://onefinsolution.net',
  SESSION_COOKIE_DOMAIN: '.onefinsolution.net',
  BILLING_PROVIDER: 'stripe',
  BILLING_CURRENCY: env.BILLING_CURRENCY || 'thb',
  BILLING_STATEMENT_CURRENCY: env.BILLING_STATEMENT_CURRENCY || 'thb',
  STRIPE_USD_THB_RATE: env.STRIPE_USD_THB_RATE || '36',
};

if (env.STRIPE_CREDIT_PLANS) out.STRIPE_CREDIT_PLANS = env.STRIPE_CREDIT_PLANS;
if (env.STRIPE_SOFTWARE_CATALOG)
  out.STRIPE_SOFTWARE_CATALOG = env.STRIPE_SOFTWARE_CATALOG;
if (env.STRIPE_PERSONAL_PLAN_PRICE_IDS) {
  out.STRIPE_PERSONAL_PLAN_PRICE_IDS = env.STRIPE_PERSONAL_PLAN_PRICE_IDS;
}
if (env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
  out.STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
}
if (env.STRIPE_WEBHOOK_ENDPOINT_ID) {
  out.STRIPE_WEBHOOK_ENDPOINT_ID = env.STRIPE_WEBHOOK_ENDPOINT_ID;
}
if (env.WORKSPACE_SIGNING_KEY) out.WORKSPACE_SIGNING_KEY = env.WORKSPACE_SIGNING_KEY;
if (env.RESEND_API_KEY) out.RESEND_API_KEY = env.RESEND_API_KEY;
if (env.RESEND_FROM_EMAIL) out.RESEND_FROM_EMAIL = env.RESEND_FROM_EMAIL;
if (env.EMAIL_FROM) out.EMAIL_FROM = env.EMAIL_FROM;
if (env.SIGNUP_CREDITS) out.SIGNUP_CREDITS = env.SIGNUP_CREDITS;

// Validate catalogs
try {
  const personal = JSON.parse(out.STRIPE_PERSONAL_PLAN_PRICE_IDS || '{}');
  const credits = JSON.parse(out.STRIPE_CREDIT_PLANS || '{}');
  const software = JSON.parse(out.STRIPE_SOFTWARE_CATALOG || '{}');
  console.log(
    'catalogs',
    JSON.stringify({
      personal: Object.keys(personal).length,
      credits: Object.keys(credits).length,
      software: Object.keys(software).length,
      webhook: Boolean(out.STRIPE_WEBHOOK_SECRET),
      site: out.NEXT_PUBLIC_SITE_URL,
    }),
  );
  if (Object.keys(personal).length < 4) {
    console.error('ERROR: need 4 personal plan price ids — run provision-live-stripe.mjs --apply first');
    process.exit(1);
  }
  if (Object.keys(credits).length < 1) {
    console.error('ERROR: need credit plans');
    process.exit(1);
  }
} catch (e) {
  console.error('catalog parse failed', e.message);
  process.exit(1);
}

let ok = 0;
let fail = 0;
for (const [k, v] of Object.entries(out)) {
  const result = railwaySet(k, v);
  if (result.ok) {
    ok += 1;
    console.log('SET_OK', k, 'len', String(v).length);
  } else {
    fail += 1;
    console.log('SET_FAIL', k, result.err || '');
  }
}

writeFileSync(
  '.railway-live-sync-result.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      ok,
      fail,
      keys: Object.keys(out),
    },
    null,
    2,
  ) + '\n',
);

console.log(JSON.stringify({ done: true, ok, fail }));
if (fail > 0) process.exit(2);
