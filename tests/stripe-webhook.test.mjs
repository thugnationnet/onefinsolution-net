import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';

function load(file, dependencies, env = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  runInNewContext(outputText, {
    exports,
    require: (name) => dependencies[name] || {},
    process: { env },
    Response,
    Request,
    console,
  });
  return exports;
}

const secret = 'whsec_unit_test_only';
const stripe = new Stripe('sk_test_unit_test_only');

function baseDeps(env, extras = {}) {
  const forwarded = extras.forwarded || [];
  const ledger = extras.ledger || {
    claims: [],
    processed: [],
    failed: [],
  };
  const claimImpl =
    extras.claim ||
    (async (event) => {
      ledger.claims.push(event.id);
      return { action: 'process', attempts: 1 };
    });

  return {
    deps: {
      '@/lib/stripe': { stripeClient: () => stripe, verifiedStripe: async () => stripe },
      '@/lib/stripe-fulfillment': {
        fulfillStripeEvent: async (_stripe, event) => {
          if (extras.fulfillError) throw extras.fulfillError;
          forwarded.push(event.type);
        },
      },
      '@/lib/software-storefront-fulfillment': {
        fulfillSoftwareStorefrontPayment: async () => {
          if (extras.softwareError) throw extras.softwareError;
        },
      },
      '@/lib/billing-environment': {
        stripeObjectMatchesMode: (livemode) => livemode === (env.STRIPE_MODE === 'live'),
      },
      '@/lib/stripe-webhook-ledger': {
        claimStripeWebhookEvent: claimImpl,
        markStripeWebhookEventProcessed: async (eventId) => {
          ledger.processed.push(eventId);
        },
        markStripeWebhookEventFailed: async (eventId, error) => {
          ledger.failed.push({ eventId, message: error instanceof Error ? error.message : String(error) });
        },
      },
    },
    forwarded,
    ledger,
  };
}

test('webhook rejects missing, modified, stale signatures and every Live Mode event', async () => {
  const env = {
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const { deps, forwarded, ledger } = baseDeps(env);
  const { POST } = load('app/api/stripe/webhook/route.ts', deps, env);
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'invoice.paid',
    livemode: false,
    data: { object: { id: 'in_test' } },
  });
  const sign = (value, timestamp) =>
    stripe.webhooks.generateTestHeaderString({ payload: value, secret, timestamp });

  for (const [body, signature] of [
    [payload, ''],
    [payload + ' ', sign(payload)],
    [payload, sign(payload, 1)],
  ]) {
    const response = await POST(
      new Request('https://example.test/api/stripe/webhook', {
        method: 'POST',
        body,
        headers: { 'stripe-signature': signature },
      }),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(ledger.claims.length, 0);

  const live = payload.replace('"livemode":false', '"livemode":true');
  assert.equal(
    (
      await POST(
        new Request('https://example.test/api/stripe/webhook', {
          method: 'POST',
          body: live,
          headers: { 'stripe-signature': sign(live) },
        }),
      )
    ).status,
    400,
  );

  for (const type of ['invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required']) {
    const event = JSON.stringify({
      id: `evt_${type}`,
      type,
      livemode: false,
      data: { object: { id: 'in_test' } },
    });
    assert.equal(
      (
        await POST(
          new Request('https://example.test/api/stripe/webhook', {
            method: 'POST',
            body: event,
            headers: { 'stripe-signature': sign(event) },
          }),
        )
      ).status,
      200,
    );
  }
  assert.deepEqual(forwarded, ['invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required']);
  assert.equal(ledger.processed.length, 3);

  env.STRIPE_MODE = 'live';
  assert.equal(
    (
      await POST(
        new Request('https://example.test/api/stripe/webhook', {
          method: 'POST',
          body: live,
          headers: { 'stripe-signature': sign(live) },
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(forwarded.at(-1), 'invoice.paid');
});

test('duplicate processed events skip fulfillment and return 200', async () => {
  const env = {
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const { deps, forwarded, ledger } = baseDeps(env, {
    claim: async () => ({ action: 'skip_processed' }),
  });
  const { POST } = load('app/api/stripe/webhook/route.ts', deps, env);
  const payload = JSON.stringify({
    id: 'evt_dup',
    type: 'payment_intent.succeeded',
    livemode: false,
    data: { object: { id: 'pi_1' } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const response = await POST(
    new Request('https://example.test/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(forwarded, []);
  assert.deepEqual(ledger.processed, []);
  assert.deepEqual(ledger.failed, []);
});

test('in-flight events return retryable 503 without fulfillment', async () => {
  const env = {
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const { deps, forwarded } = baseDeps(env, {
    claim: async () => ({ action: 'skip_in_flight' }),
  });
  const { POST } = load('app/api/stripe/webhook/route.ts', deps, env);
  const payload = JSON.stringify({
    id: 'evt_busy',
    type: 'invoice.paid',
    livemode: false,
    data: { object: { id: 'in_busy' } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const response = await POST(
    new Request('https://example.test/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature },
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(forwarded, []);
});

test('fulfillment failures are recorded and return retryable 503', async () => {
  const env = {
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const { deps, ledger } = baseDeps(env, {
    fulfillError: new Error('forced fulfillment failure'),
  });
  const { POST } = load('app/api/stripe/webhook/route.ts', deps, env);
  const payload = JSON.stringify({
    id: 'evt_fail',
    type: 'invoice.paid',
    livemode: false,
    data: { object: { id: 'in_fail' } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const response = await POST(
    new Request('https://example.test/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature },
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(ledger.processed, []);
  assert.equal(ledger.failed.length, 1);
  assert.equal(ledger.failed[0].eventId, 'evt_fail');
  assert.equal(ledger.failed[0].message, 'forced fulfillment failure');
});

test('only paid standalone packs allocate Workspace credits; subscription invoices grant chat access only', async () => {
  const grants = new Map();
  const { fulfillStripeEvent } = load('lib/stripe-fulfillment.ts', {
    './site-url': { sitePath: path => `https://onefinsolution.net${path}` },
    './subscription-catalog':{managedPlan:()=>undefined},
    './billing-environment':{stripeObjectMatchesMode:livemode=>!livemode},
    './billing-notices':{queueBillingNotice:async()=>{}},
    './db': {query:async (sql,values)=>{
      if(sql.startsWith('select user_id')) return [{user_id:'user-1'}];
      if(sql.startsWith('select grant_credits')) grants.set(values[1],{p_user:values[0],p_reference:values[1],p_amount:values[2],p_expires:values[3]});
      return [];
    }},
    './credit-config': { creditPlans: () => ({ price_pack: { credits: 50, kind: 'pack' } }) },
    './workspace-credit-pack': { workspaceCreditPack: { id: 'workspace-50', credits: 50, amount: 500, currency: 'usd' } },
  });
  const session = { id: 'cs_test_1', mode: 'payment', metadata: { app: 'chatbot-template' }, customer: 'cus_test', payment_status: 'unpaid', livemode: false, currency: 'usd' };
  const api = { subscriptions: { retrieve: async () => ({ id: 'sub_test', livemode: false, items: { data: [{ price: { id: 'price_month' }, current_period_start: 1990000000, current_period_end: 2000000000 }] }, status: 'active', cancel_at_period_end: false }) }, checkout: { sessions: { retrieve: async () => session, listLineItems: async function* () { yield { id: 'li_pack', price: { id: 'price_pack' }, quantity: 1 }; } } },
    invoices: { retrieve: async () => ({ id: 'in_test', parent: { subscription_details: { subscription: 'sub_test', metadata: { app: 'chatbot-template' } } }, customer: 'cus_test', livemode: false, currency: 'usd', status: 'paid' }),
      listLineItems: async function* () { yield { id: 'li_invoice', pricing: { price_details: { price: 'price_month' } }, quantity: 1, amount: 900, period: { end: 2000000000 } }; } },
  };
  const event = type => ({ type, livemode: false, data: { object: { id: 'cs_test_1' } } });
  await fulfillStripeEvent(api,event('checkout.session.completed'));
  assert.equal(grants.size,0);
  session.payment_status = 'paid';
  await fulfillStripeEvent(api,event('checkout.session.completed'));
  await fulfillStripeEvent(api,event('checkout.session.async_payment_succeeded'));
  assert.equal(grants.size,1);
  assert.equal(grants.get('checkout:cs_test_1:li_pack').p_amount,50);
  await fulfillStripeEvent(api,event('invoice.paid'));
  await fulfillStripeEvent(api,event('invoice.paid'));
  assert.equal(grants.size,1);
  assert.equal(grants.has('subscription:sub_test:invoice:in_test:li_invoice'),false);
  await fulfillStripeEvent(api,event('invoice.payment_failed'));
  assert.equal(grants.size,1);
  await assert.rejects(fulfillStripeEvent(api,{ ...event('invoice.paid'),livemode:true }),/Stripe event mode does not match/);
});
