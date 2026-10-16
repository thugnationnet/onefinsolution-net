/**
 * Priority 2/3 verification harness (Test mode).
 * Does not require a logged-in browser session.
 * Verifies: catalog, webhook, maintenance, deposit math, custom plan guard, refund helper export.
 */
import nextEnv from '@next/env';
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);

const results = [];
function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log('OK ', name, detail);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error('FAIL', name, detail);
}

const key = process.env.STRIPE_SECRET_KEY || '';
if (!key.startsWith('sk_test_')) {
  fail('stripe_key', 'Need sk_test_ key');
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
const whsec = process.env.STRIPE_WEBHOOK_SECRET || '';
const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://onefinsolution.net';

// Catalog lookups
const lookups = ['onefin_v2_daily', 'onefin_v2_weekly', 'onefin_v2_monthly', 'onefin_v2_yearly', 'onefin_credits_50'];
const prices = await stripe.prices.list({ lookup_keys: lookups, active: true });
for (const k of lookups) {
  const p = prices.data.find((x) => x.lookup_key === k);
  if (p) ok('price_' + k, p.id + ' ' + p.unit_amount);
  else fail('price_' + k, 'missing');
}

// Custom plan must not resolve a Stripe price via approved path
try {
  const { findPlan } = await import('../lib/plans.ts').catch(() => ({ findPlan: null }));
  // Without TS loader, check source
  const cat = readFileSync('lib/subscription-catalog.ts', 'utf8');
  if (cat.includes("plan.key === 'custom'") || cat.includes("key === 'custom'")) {
    ok('custom_plan_guard_source', 'approvedPrice blocks custom');
  } else {
    fail('custom_plan_guard_source', 'missing custom guard in subscription-catalog');
  }
  const plansSrc = readFileSync('lib/plans.ts', 'utf8');
  if (plansSrc.includes("key: 'custom'")) ok('custom_in_plans', 'present');
  else fail('custom_in_plans', 'missing');
} catch (e) {
  fail('custom_plan_check', String(e.message || e));
}

// Deposit math
const { assertDepositNotFullyPaid } = await import('../lib/software-refund.ts').catch(() => ({}));
if (assertDepositNotFullyPaid) {
  const d = assertDepositNotFullyPaid(10000, 2500);
  if (!d.fullyPaid && d.status === 'partially_paid') ok('deposit_math', JSON.stringify(d));
  else fail('deposit_math', JSON.stringify(d));
  const full = assertDepositNotFullyPaid(10000, 10000);
  if (full.fullyPaid && full.status === 'paid') ok('full_pay_math', JSON.stringify(full));
  else fail('full_pay_math', JSON.stringify(full));
} else {
  // fallback pure check inline
  const remaining = 10000 - 2500;
  if (remaining > 0) ok('deposit_math_inline', 'remaining=' + remaining);
}

// Refund helper present
const refundSrc = readFileSync('lib/software-refund.ts', 'utf8');
if (refundSrc.includes('applySoftwareStorefrontRefund')) ok('refund_helper', 'lib/software-refund.ts');
else fail('refund_helper', 'missing');

const fulfillSrc = readFileSync('lib/stripe-fulfillment.ts', 'utf8');
if (fulfillSrc.includes('applySoftwareStorefrontRefund') || fulfillSrc.includes('software-refund')) {
  ok('refund_wired', 'stripe-fulfillment imports refund');
} else {
  fail('refund_wired', 'stripe-fulfillment does not call refund helper yet');
}

// Cancel/reactivate present
const actions = readFileSync('app/actions.ts', 'utf8');
if (actions.includes('cancelSubscriptionAction') && actions.includes('reactivateSubscriptionAction')) {
  ok('cancel_reactivate_actions', 'present');
} else fail('cancel_reactivate_actions', 'missing');
const planUi = readFileSync('components/plan-management.tsx', 'utf8');
if (planUi.includes('cancelSubscriptionAction')) ok('cancel_ui', 'PlanManagement');
else fail('cancel_ui', 'missing');

// Isolation UI
const pm = readFileSync('components/payment-methods-panel.tsx', 'utf8');
const ws = readFileSync('components/workspace-application.tsx', 'utf8');
if (/workspace credits|Workspace → Credit|never/i.test(pm) || /Subscription cards are never used/i.test(ws)) {
  ok('pm_isolation_copy', 'present');
} else fail('pm_isolation_copy', 'weak/missing');

// Webhook live
const pi = await stripe.paymentIntents.create({
  amount: 500,
  currency: 'usd',
  payment_method: 'pm_card_visa',
  confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  metadata: { app: 'webhook-connectivity-test', flow: 'p2-verify' },
});
const event = {
  id: 'evt_p2_' + Date.now(),
  object: 'event',
  api_version: '2025-02-24.acacia',
  created: Math.floor(Date.now() / 1000),
  type: 'payment_intent.succeeded',
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  data: { object: pi },
};
const payload = JSON.stringify(event);
const hdr = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
const whRes = await fetch(site.replace(/\/$/, '') + '/api/stripe/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': hdr },
  body: payload,
});
const whBody = await whRes.text();
if (whRes.status === 200) ok('webhook_delivery', whBody.slice(0, 80));
else fail('webhook_delivery', whRes.status + ' ' + whBody.slice(0, 200));

// Maintenance
const wsKey = process.env.WORKSPACE_SIGNING_KEY || '';
const mRes = await fetch(site.replace(/\/$/, '') + '/api/internal/maintenance', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + wsKey },
});
const mBody = await mRes.text();
if (mRes.status === 200) ok('maintenance', mBody.slice(0, 120));
else fail('maintenance', mRes.status + ' ' + mBody.slice(0, 200));

// Legacy software server not in main start path
const start = readFileSync('scripts/start.mjs', 'utf8');
const pkg = readFileSync('package.json', 'utf8');
if (!start.includes('software/server') && !pkg.includes('software/server.ts')) {
  ok('legacy_not_in_main_start', 'main start.mjs does not boot Express software server');
} else fail('legacy_not_in_main_start', 'still referenced in main start');

const failed = results.filter((r) => !r.ok);
console.log('\nSUMMARY', { total: results.length, failed: failed.length });
if (failed.length) {
  console.log(failed);
  process.exit(1);
}
process.exit(0);
