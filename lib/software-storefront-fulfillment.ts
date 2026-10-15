import 'server-only';
import Stripe from 'stripe';
import { query, transaction } from '@/lib/db';
import { sendBillingEmail, sendSoftwarePurchaseEmail, sendSoftwarePaymentFailedEmail, emailConfigured } from '@/lib/email';
import {
  getSoftwarePurchaseItem,
  paymentStatusFromTotals,
  recomputePurchasePaymentFields,
  remainingBalanceCents,
  type SoftwarePaymentStatus,
} from '@/lib/software-purchase';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';

type PurchaseRow = {
  id: string;
  user_id: string;
  item_kind: string;
  item_id: string;
  item_name: string;
  amount_paid_cents: number;
  total_price_cents: number;
  status: SoftwarePaymentStatus;
  inquiry_status: string;
  currency: string;
  stripe_payment_intent_id: string | null;
};

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

function paymentAttemptStatus(
  eventType: string,
  intentStatus: string,
): 'succeeded' | 'failed' | 'canceled' | 'pending' {
  if (eventType === 'payment_intent.succeeded' || intentStatus === 'succeeded') return 'succeeded';
  if (eventType === 'payment_intent.canceled' || intentStatus === 'canceled') return 'canceled';
  if (eventType === 'payment_intent.payment_failed' || intentStatus === 'requires_payment_method') {
    return 'failed';
  }
  return 'pending';
}

/**
 * Apply a software storefront PaymentIntent to the purchase ledger and recompute totals.
 * Only succeeded payments reduce remaining balance. Duplicate PI events are idempotent.
 */
export async function fulfillSoftwareStorefrontPayment(stripe: Stripe, event: Stripe.Event) {
  if (
    !['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'].includes(
      event.type,
    )
  ) {
    return;
  }

  const eventIntent = event.data.object as Stripe.PaymentIntent;
  if (
    eventIntent.metadata?.app !== 'onefin-software-store' ||
    eventIntent.metadata.billing_scope !== 'software'
  ) {
    return;
  }

  const intent = await stripe.paymentIntents.retrieve(eventIntent.id, { expand: ['latest_charge'] });
  const metadata = intent.metadata;
  const item = getSoftwarePurchaseItem(metadata.item_kind, metadata.item_id);
  const attemptAmount = intent.amount_received || intent.amount;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !item ||
    !stripeObjectMatchesMode(intent.livemode) ||
    intent.currency !== 'usd' ||
    attemptAmount < 500 ||
    !metadata.user_id ||
    !metadata.purchase_id ||
    !uuid.test(metadata.user_id) ||
    !uuid.test(metadata.purchase_id)
  ) {
    throw new Error('Unexpected software storefront payment details.');
  }

  const stripeCustomerId = stripeId(intent.customer);
  if (!stripeCustomerId) throw new Error('Software payment is missing its billing customer.');

  const [mapping] = await query<{ user_id: string }>(
    'select user_id from software_billing_customers where customer_id=$1',
    [stripeCustomerId],
  );
  if (!mapping || mapping.user_id !== metadata.user_id) {
    throw new Error('Software payment customer ownership mismatch.');
  }

  // Locate purchase by id (installments may use a different PI than the original deposit PI).
  const [purchase] = await query<PurchaseRow>(
    `select id,user_id,item_kind,item_id,item_name,amount_paid_cents,total_price_cents,status,
            inquiry_status,currency,stripe_payment_intent_id
     from software_storefront_purchases
     where id=$1`,
    [metadata.purchase_id],
  );

  if (
    !purchase ||
    purchase.user_id !== metadata.user_id ||
    purchase.item_kind !== item.kind ||
    purchase.item_id !== item.id
  ) {
    throw new Error('Software storefront purchase record does not match Stripe.');
  }

  // Agreed price is authoritative on the purchase row (not overwritten by installment amount).
  const agreedPriceCents = purchase.total_price_cents;
  if (!Number.isSafeInteger(agreedPriceCents) || agreedPriceCents <= 0) {
    throw new Error('Software purchase is missing an agreed project price.');
  }
  if (Number(metadata.full_price_cents) && Number(metadata.full_price_cents) !== agreedPriceCents) {
    throw new Error('Software payment agreed-price metadata does not match the purchase.');
  }
  if (attemptAmount > agreedPriceCents) {
    throw new Error('Software payment exceeds the agreed project price.');
  }

  const attemptStatus = paymentAttemptStatus(event.type, intent.status);
  const chargeId = stripeId(intent.latest_charge as string | { id: string } | null);
  const initiatedBy = metadata.initiated_by === 'company' ? 'company' : 'customer';
  const failureMessage =
    attemptStatus === 'failed'
      ? intent.last_payment_error?.message || 'Payment failed.'
      : attemptStatus === 'canceled'
        ? 'Payment canceled.'
        : null;

  await transaction(async (client) => {
    // Idempotent ledger upsert keyed by Stripe PaymentIntent id.
    await client.query(
      `insert into software_storefront_payments (
         purchase_id, user_id, amount_cents, currency, status,
         stripe_payment_intent_id, stripe_charge_id, initiated_by,
         failure_message, created_at, succeeded_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,
         $6,$7,$8,
         $9,now(),$10,now()
       )
       on conflict (stripe_payment_intent_id) do update set
         status = excluded.status,
         amount_cents = excluded.amount_cents,
         stripe_charge_id = coalesce(excluded.stripe_charge_id, software_storefront_payments.stripe_charge_id),
         failure_message = excluded.failure_message,
         succeeded_at = case
           when excluded.status = 'succeeded'
             then coalesce(software_storefront_payments.succeeded_at, excluded.succeeded_at, now())
           else software_storefront_payments.succeeded_at
         end,
         updated_at = now()`,
      [
        purchase.id,
        purchase.user_id,
        attemptAmount,
        intent.currency,
        attemptStatus,
        intent.id,
        chargeId,
        initiatedBy,
        failureMessage,
        attemptStatus === 'succeeded' ? new Date() : null,
      ],
    );

    // Only succeeded rows count toward total paid (prevents double-count and failed deposits).
    const sumResult = await client.query<{ total: string | number }>(
      `select coalesce(sum(amount_cents), 0) as total
       from software_storefront_payments
       where purchase_id=$1 and status='succeeded'`,
      [purchase.id],
    );
    const successfulPaymentCents = Number(sumResult.rows[0]?.total || 0);

    const recomputed = recomputePurchasePaymentFields({
      agreedPriceCents,
      successfulPaymentCents,
      previousStatus: purchase.status,
    });

    // Never treat a deposit as full payment unless remaining is zero.
    if (recomputed.fullyPaid && successfulPaymentCents < agreedPriceCents) {
      throw new Error('Fully paid requires successful payments to cover the agreed project price.');
    }

    await client.query(
      `update software_storefront_purchases set
         amount_paid_cents=$2,
         status=$3,
         paid_at=case
           when $3='paid' then coalesce(paid_at, now())
           else null
         end,
         stripe_payment_intent_id=coalesce(stripe_payment_intent_id, $4)
       where id=$1`,
      [purchase.id, recomputed.amountPaidCents, recomputed.status, intent.id],
    );

    // Keep inquiry/project status independent of payment status.
    // (No automatic inquiry_status change on payment — product workflow owns that.)
  });

  const [buyer] = await query<{ email: string }>(
    'select email from app_users where id=$1',
    [metadata.user_id],
  );

  if (attemptStatus === 'succeeded' && buyer?.email && emailConfigured()) {
    const remaining = remainingBalanceCents({
      agreedPriceCents,
      amountPaidCents: Number(
        (
          await query<{ amount_paid_cents: number }>(
            'select amount_paid_cents from software_storefront_purchases where id=$1',
            [purchase.id],
          )
        )[0]?.amount_paid_cents || 0,
      ),
    });
    const paymentStatus = paymentStatusFromTotals({
      agreedPriceCents,
      amountPaidCents: agreedPriceCents - remaining,
    });
    const amountPaidLabel = `$${(attemptAmount / 100).toFixed(2)}`;
    const remainingLabel = `$${(remaining / 100).toFixed(2)}`;
    const itemLabel = purchase.item_name || item?.name || 'Software item';
    await sendSoftwarePurchaseEmail(buyer.email, {
      itemName: itemLabel,
      amountLabel: amountPaidLabel,
      remainingLabel: remaining > 0 ? remainingLabel : undefined,
      statusLabel: paymentStatus,
      note:
        remaining === 0
          ? `Payment received for ${itemLabel}. Your software purchase is paid in full.`
          : `Payment received for ${itemLabel}. Remaining balance: ${remainingLabel}.`,
      actionUrl: '/software/account',
    }).catch(() => undefined);
  } else if (attemptStatus === 'failed' && buyer?.email && emailConfigured()) {
    const itemLabel = purchase.item_name || item?.name || 'Software item';
    const amountLabel = `$${(attemptAmount / 100).toFixed(2)}`;
    await sendSoftwarePaymentFailedEmail(buyer.email, {
      itemName: itemLabel,
      amountLabel,
      note: `Your software payment for ${itemLabel} could not be completed. You can retry from your software account.`,
      actionUrl: '/software/account',
    }).catch(() => undefined);
  }
}
