import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, fn) {
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after === before) {
    console.log('NOCHANGE', path);
    return false;
  }
  writeFileSync(path, after);
  console.log('PATCHED', path);
  return true;
}

const refundHelper = `
/**
 * Apply charge.refunded to the software ledger.
 * Full refund of a payment attempt marks it refunded so it no longer counts toward amount_paid.
 * Purchase payment_status is recomputed from remaining succeeded payments only.
 * Never leaves a deposit marked as fully paid after refund.
 */
export async function applySoftwareStorefrontRefund(
  _stripe: Stripe,
  charge: Stripe.Charge,
): Promise<{ applied: boolean; purchaseId?: string }> {
  if (!stripeObjectMatchesMode(charge.livemode)) {
    throw new Error('Stripe charge mode does not match the application.');
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id || null;
  if (!paymentIntentId) return { applied: false };

  const refundedTotal =
    typeof charge.amount_refunded === 'number' ? charge.amount_refunded : 0;
  if (refundedTotal <= 0) return { applied: false };

  // Only full refunds of the original charge drop the payment row from paid totals.
  const fullyRefunded = Boolean(charge.refunded) || refundedTotal >= (charge.amount || 0);
  if (!fullyRefunded) {
    return { applied: false };
  }

  let updatedPurchaseId: string | undefined;

  await transaction(async (client) => {
    const paymentResult = await client.query<{
      id: string;
      purchase_id: string;
      status: string;
      amount_cents: number;
    }>(
      \`select id, purchase_id, status, amount_cents
       from software_storefront_payments
       where stripe_payment_intent_id = $1
       for update\`,
      [paymentIntentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) return;
    if (payment.status === 'refunded') {
      updatedPurchaseId = payment.purchase_id;
      return;
    }
    if (payment.status !== 'succeeded') return;

    await client.query(
      \`update software_storefront_payments
       set status = 'refunded',
           succeeded_at = null,
           updated_at = now()
       where id = $1\`,
      [payment.id],
    );

    const purchaseResult = await client.query<{
      id: string;
      total_price_cents: number;
      status: string;
    }>(
      \`select id, total_price_cents, status
       from software_storefront_purchases
       where id = $1
       for update\`,
      [payment.purchase_id],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) return;

    const sumResult = await client.query<{ total: string | number }>(
      \`select coalesce(sum(amount_cents), 0) as total
       from software_storefront_payments
       where purchase_id = $1 and status = 'succeeded'\`,
      [purchase.id],
    );
    const successfulPaymentCents = Number(sumResult.rows[0]?.total || 0);
    const recomputed = recomputePurchasePaymentFields({
      agreedPriceCents: purchase.total_price_cents,
      successfulPaymentCents,
      previousStatus: purchase.status as SoftwarePaymentStatus,
    });

    // Never treat a deposit (or post-refund remainder) as full purchase.
    if (recomputed.fullyPaid && successfulPaymentCents < purchase.total_price_cents) {
      throw new Error('Software refund recompute incorrectly marked purchase as fully paid.');
    }

    await client.query(
      \`update software_storefront_purchases
       set amount_paid_cents = $2,
           status = $3,
           paid_at = case
             when $4::text = 'set' then coalesce(paid_at, now())
             when $4::text = 'clear' then null
             else paid_at
           end,
           updated_at = now()
       where id = $1\`,
      [purchase.id, recomputed.amountPaidCents, recomputed.status, recomputed.paidAt],
    );

    updatedPurchaseId = purchase.id;
  });

  return { applied: Boolean(updatedPurchaseId), purchaseId: updatedPurchaseId };
}
`;

patch('lib/software-storefront-fulfillment.ts', (src) => {
  if (src.includes('applySoftwareStorefrontRefund')) return src;
  return src.replace(/\r\n/g, '\n').trimEnd() + '\n' + refundHelper + '\n';
});

patch('lib/stripe-fulfillment.ts', (src) => {
  let out = src;
  if (!out.includes("from './software-storefront-fulfillment'")) {
    out = out.replace(
      "import { managedPlan } from './subscription-catalog';",
      "import { managedPlan } from './subscription-catalog';\nimport { applySoftwareStorefrontRefund } from './software-storefront-fulfillment';",
    );
  }
  if (!out.includes('applySoftwareStorefrontRefund(stripe, charge)')) {
    out = out.replace(
      "const charge = event.data.object as Stripe.Charge;\n    try {\n      const user = await owner(charge.customer);",
      "const charge = event.data.object as Stripe.Charge;\n    // Software ledger first (payment_intent linked). Non-software charges no-op safely.\n    await applySoftwareStorefrontRefund(stripe, charge);\n    try {\n      const user = await owner(charge.customer);",
    );
    // CRLF variant
    out = out.replace(
      "const charge = event.data.object as Stripe.Charge;\r\n    try {\r\n      const user = await owner(charge.customer);",
      "const charge = event.data.object as Stripe.Charge;\r\n    // Software ledger first (payment_intent linked). Non-software charges no-op safely.\r\n    await applySoftwareStorefrontRefund(stripe, charge);\r\n    try {\r\n      const user = await owner(charge.customer);",
    );
  }
  return out;
});

patch('lib/plans.ts', (src) => {
  if (src.includes("key: 'custom'")) return src;
  let out = src.replace(/\r\n/g, '\n');
  out = out.replace(
    "{ key: 'yearly', name: 'Yearly', amount: 24900, interval: 'year', trialDays: 15 },\n] as const;",
    "{ key: 'yearly', name: 'Yearly', amount: 24900, interval: 'year', trialDays: 15 },\n  // Schema allows 'custom' (migration 006) for ops/manual billing — not self-serve checkout.\n  { key: 'custom', name: 'Custom', amount: 0, interval: 'month' as const, trialDays: 0 },\n] as const;",
  );
  // Also handle non-as-const ending
  if (!out.includes("key: 'custom'")) {
    out = out.replace(
      /\{ key: 'yearly'[^}]+\},?\n\]/,
      (m) => m.replace(/\n\]/, ",\n  { key: 'custom', name: 'Custom', amount: 0, interval: 'month' as const, trialDays: 0 },\n]"),
    );
  }
  return out;
});

patch('lib/subscription-enrollment.ts', (src) => {
  if (src.includes("planKey === 'custom'") || src.includes('planKey === "custom"')) return src;
  let out = src;
  // Insert after plan/mode validation block if present
  const patterns = [
    /(throw new Error\('Choose a valid plan and billing mode\.'\);\s*\})/,
    /(throw new Error\("Choose a valid plan and billing mode\."\);\s*\})/,
  ];
  for (const re of patterns) {
    if (re.test(out)) {
      out = out.replace(
        re,
        `$1\n  // Custom plans are schema-supported for ops/manual billing, not self-serve Stripe Checkout.\n  if (planKey === 'custom') {\n    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');\n  }`,
      );
      return out;
    }
  }
  // Fallback near prepareEnrollment body start after destructure
  out = out.replace(
    /(export async function prepareEnrollment\([\s\S]*?\{)/,
    `$1\n  if ((arguments as any)?.[0] === 'custom') {\n    throw new Error('Custom plans are arranged with our team.');\n  }\n`,
  );
  // Better: find planKey usage early
  if (!out.includes("planKey === 'custom'")) {
    out = out.replace(
      /(const plan = findPlan\(planKey\);)/,
      `if (planKey === 'custom') {\n    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');\n  }\n  $1`,
    );
  }
  return out;
});

patch('components/payment-methods-panel.tsx', (src) => {
  if (src.includes('never charge workspace credits')) return src;
  return src.replace(
    'Manage cards used for Home Page Chat Plus plans and renewals.',
    'These cards pay Chat Plus plans and renewals only. They never charge workspace credits — save a separate card under Workspace → Credit reloads for auto-reload.',
  );
});

patch('components/workspace-application.tsx', (src) => {
  if (src.includes('subscription cards are never used') || src.includes('Subscription cards are never used')) {
    return src;
  }
  // Strengthen existing isolation copy if a weaker version exists
  return src.replace(
    'One-time purchases only',
    'Workspace credits only — not subscription',
  );
});

patch('app/software/account/page.tsx', (src) => {
  // Strengthen deposit wording: partially_paid => Deposit received / balance due
  if (src.includes('Deposit received')) return src;
  return src.replace(
    "purchase.status === 'partially_paid'\n                        ? 'Partially paid'",
    "purchase.status === 'partially_paid'\n                        ? 'Deposit / balance due'",
  ).replace(
    "purchase.status === 'partially_paid'\r\n                        ? 'Partially paid'",
    "purchase.status === 'partially_paid'\r\n                        ? 'Deposit / balance due'",
  );
});

console.log('done');
