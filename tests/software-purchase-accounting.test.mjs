import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pure accounting rules mirrored from lib/software-purchase.ts (node:test has no TS loader).
// Source tests lock fulfillment/checkout call sites.

function remainingBalanceCents({ agreedPriceCents, amountPaidCents }) {
  return Math.max(0, agreedPriceCents - Math.max(0, amountPaidCents));
}

function isFullyPaid(totals) {
  return totals.agreedPriceCents > 0 && remainingBalanceCents(totals) === 0;
}

function paymentStatusFromTotals(totals, fallback = 'pending') {
  const paid = Math.max(0, totals.amountPaidCents);
  const agreed = Math.max(0, totals.agreedPriceCents);
  if (agreed <= 0) return fallback;
  if (paid <= 0) return fallback === 'failed' ? 'failed' : 'pending';
  if (paid >= agreed) return 'paid';
  return 'partially_paid';
}

function recomputePurchasePaymentFields(input) {
  const agreedPriceCents = Math.max(0, input.agreedPriceCents);
  const amountPaidCents = Math.max(0, input.successfulPaymentCents);
  const remainingCents = remainingBalanceCents({ agreedPriceCents, amountPaidCents });
  const fullyPaid = isFullyPaid({ agreedPriceCents, amountPaidCents });
  const previous = input.previousStatus || 'pending';
  let status;
  if (fullyPaid) status = 'paid';
  else if (amountPaidCents > 0) status = 'partially_paid';
  else if (previous === 'failed') status = 'failed';
  else status = 'pending';
  return { amountPaidCents, remainingCents, status, fullyPaid };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

test('deposit is not full payment when remaining balance is positive', () => {
  const agreed = 100_000; // $1000
  const deposit = 20_000; // $200
  const totals = { agreedPriceCents: agreed, amountPaidCents: deposit };
  assert.equal(remainingBalanceCents(totals), 80_000);
  assert.equal(isFullyPaid(totals), false);
  assert.equal(paymentStatusFromTotals(totals), 'partially_paid');
  assert.notEqual(paymentStatusFromTotals(totals), 'paid');
});

test('outstanding balance calculation is correct across installments', () => {
  const agreed = 50_000;
  let paid = 0;
  const payments = [10_000, 15_000, 5_000];
  for (const amount of payments) {
    paid += amount;
    const remaining = remainingBalanceCents({ agreedPriceCents: agreed, amountPaidCents: paid });
    assert.equal(remaining, agreed - paid);
    assert.equal(paymentStatusFromTotals({ agreedPriceCents: agreed, amountPaidCents: paid }), 'partially_paid');
  }
  assert.equal(remainingBalanceCents({ agreedPriceCents: agreed, amountPaidCents: paid }), 20_000);
});

test('multiple successful payments accumulate toward agreed price', () => {
  const agreed = 30_000;
  const successful = [5_000, 10_000, 15_000];
  const sum = successful.reduce((a, b) => a + b, 0);
  const recomputed = recomputePurchasePaymentFields({
    agreedPriceCents: agreed,
    successfulPaymentCents: sum,
  });
  assert.equal(recomputed.amountPaidCents, 30_000);
  assert.equal(recomputed.remainingCents, 0);
  assert.equal(recomputed.status, 'paid');
  assert.equal(recomputed.fullyPaid, true);
});

test('failed and pending amounts do not reduce remaining balance', () => {
  const agreed = 40_000;
  // Only succeeded count — failed/pending excluded from successfulPaymentCents
  const successfulOnly = 10_000;
  const recomputed = recomputePurchasePaymentFields({
    agreedPriceCents: agreed,
    successfulPaymentCents: successfulOnly,
    previousStatus: 'pending',
  });
  assert.equal(recomputed.amountPaidCents, 10_000);
  assert.equal(recomputed.remainingCents, 30_000);
  assert.equal(recomputed.status, 'partially_paid');
  assert.equal(recomputed.fullyPaid, false);
});

test('duplicate successful payment events do not double-count when summed once', () => {
  // Ledger is unique on stripe_payment_intent_id; sum of succeeded rows is source of truth.
  const ledger = new Map();
  function applyPayment(piId, amount, status) {
    ledger.set(piId, { amount, status }); // upsert by PI id
    const successful = [...ledger.values()]
      .filter((row) => row.status === 'succeeded')
      .reduce((sum, row) => sum + row.amount, 0);
    return recomputePurchasePaymentFields({
      agreedPriceCents: 25_000,
      successfulPaymentCents: successful,
    });
  }

  const first = applyPayment('pi_1', 10_000, 'succeeded');
  assert.equal(first.amountPaidCents, 10_000);
  assert.equal(first.status, 'partially_paid');

  const duplicate = applyPayment('pi_1', 10_000, 'succeeded');
  assert.equal(duplicate.amountPaidCents, 10_000, 'duplicate PI must not double-count');
  assert.equal(duplicate.remainingCents, 15_000);

  const second = applyPayment('pi_2', 15_000, 'succeeded');
  assert.equal(second.amountPaidCents, 25_000);
  assert.equal(second.status, 'paid');
  assert.equal(second.fullyPaid, true);
});

test('Fully Paid only when remaining balance reaches zero', () => {
  assert.equal(
    recomputePurchasePaymentFields({ agreedPriceCents: 10_000, successfulPaymentCents: 9_999 }).fullyPaid,
    false,
  );
  assert.equal(
    recomputePurchasePaymentFields({ agreedPriceCents: 10_000, successfulPaymentCents: 9_999 }).status,
    'partially_paid',
  );
  assert.equal(
    recomputePurchasePaymentFields({ agreedPriceCents: 10_000, successfulPaymentCents: 10_000 }).fullyPaid,
    true,
  );
  assert.equal(
    recomputePurchasePaymentFields({ agreedPriceCents: 10_000, successfulPaymentCents: 10_000 }).status,
    'paid',
  );
  assert.equal(
    recomputePurchasePaymentFields({ agreedPriceCents: 10_000, successfulPaymentCents: 12_000 }).status,
    'paid',
  );
});

test('source: fulfillment recomputes from succeeded ledger and never sets paid from deposit alone', async () => {
  const root = repoRoot();
  const fs = await import('node:fs/promises');
  const fulfillment = await fs.readFile(path.join(root, 'lib', 'software-storefront-fulfillment.ts'), 'utf8');
  const purchaseLib = await fs.readFile(path.join(root, 'lib', 'software-purchase.ts'), 'utf8');
  const checkout = await fs.readFile(path.join(root, 'app', 'software', 'checkout', 'actions.ts'), 'utf8');
  const migration = await fs.readFile(
    path.join(root, 'migrations', 'railway', '014_software_purchase_accounting.sql'),
    'utf8',
  );

  assert.match(purchaseLib, /remainingBalanceCents/);
  assert.match(purchaseLib, /recomputePurchasePaymentFields/);
  assert.match(purchaseLib, /partially_paid/);

  assert.match(fulfillment, /software_storefront_payments/);
  assert.match(fulfillment, /status='succeeded'/);
  assert.match(fulfillment, /recomputePurchasePaymentFields/);
  assert.match(fulfillment, /on conflict \(stripe_payment_intent_id\)/);
  assert.doesNotMatch(
    fulfillment,
    /amount_paid_cents=\$2,\s*total_price_cents=\$2,\s*status='paid'/,
  );

  assert.match(checkout, /remainingBalanceCents/);
  assert.match(checkout, /createSoftwareBalancePaymentIntent/);
  assert.match(checkout, /full_price_cents/);
  assert.match(checkout, /partially_paid/);

  assert.match(migration, /create table if not exists software_storefront_payments/);
  assert.match(migration, /partially_paid/);
  assert.match(migration, /amount_paid_cents < total_price_cents/);
});

test('schema migration 014 separates payment status from inquiry status', async () => {
  const root = repoRoot();
  const fs = await import('node:fs/promises');
  const migration = await fs.readFile(
    path.join(root, 'migrations', 'railway', '014_software_purchase_accounting.sql'),
    'utf8',
  );
  assert.match(migration, /inquiry_status/);
  assert.match(migration, /Payment status/);
  assert.match(migration, /software_storefront_payments_succeeded_at_check/);
  assert.match(migration, /initiated_by/);
});
