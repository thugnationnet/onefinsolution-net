import 'server-only';
import type Stripe from 'stripe';
import { transaction } from '@/lib/db';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import {
  recomputePurchasePaymentFields,
  type SoftwarePaymentStatus,
} from '@/lib/software-purchase';

/**
 * Apply charge.refunded to the software ledger.
 * Full refund of a payment attempt marks it refunded so it no longer counts toward amount_paid.
 * Purchase payment_status is recomputed from remaining succeeded payments only.
 * Never leaves a deposit marked as fully paid after refund.
 */
export async function applySoftwareStorefrontRefund(
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
      `select id, purchase_id, status, amount_cents
       from software_storefront_payments
       where stripe_payment_intent_id = $1
       for update`,
      [paymentIntentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) return;
    if (payment.status === 'refunded') {
      updatedPurchaseId = payment.purchase_id;
      return;
    }
    if (payment.status !== 'succeeded') return;

    // Match columns that exist on software_storefront_payments (no updated_at required).
    await client.query(
      `update software_storefront_payments
       set status = 'refunded',
           succeeded_at = null
       where id = $1`,
      [payment.id],
    );

    const purchaseResult = await client.query<{
      id: string;
      total_price_cents: number;
      status: string;
    }>(
      `select id, total_price_cents, status
       from software_storefront_purchases
       where id = $1
       for update`,
      [payment.purchase_id],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) return;

    const sumResult = await client.query<{ total: string | number }>(
      `select coalesce(sum(amount_cents), 0) as total
       from software_storefront_payments
       where purchase_id = $1 and status = 'succeeded'`,
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

    // Match fulfillment update shape (no updated_at column on purchases).
    await client.query(
      `update software_storefront_purchases set
         amount_paid_cents = $2,
         status = $3,
         paid_at = case
           when $3 = 'paid' then coalesce(paid_at, now())
           else null
         end
       where id = $1`,
      [purchase.id, recomputed.amountPaidCents, recomputed.status],
    );

    updatedPurchaseId = purchase.id;
  });

  return { applied: Boolean(updatedPurchaseId), purchaseId: updatedPurchaseId };
}

/** Pure helper for tests: deposit never equals paid-in-full when remaining > 0. */
export function assertDepositNotFullyPaid(agreedPriceCents: number, amountPaidCents: number) {
  const remaining = Math.max(0, agreedPriceCents - Math.max(0, amountPaidCents));
  if (remaining > 0 && amountPaidCents > 0) {
    return { fullyPaid: false, status: 'partially_paid' as const, remaining };
  }
  if (remaining === 0 && amountPaidCents > 0) {
    return { fullyPaid: true, status: 'paid' as const, remaining: 0 };
  }
  return { fullyPaid: false, status: 'pending' as const, remaining: agreedPriceCents };
}
