import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { query } from '@/lib/db';
import type Stripe from 'stripe';
import { verifiedStripe } from '@/lib/stripe';
import { fulfillSoftwareStorefrontPayment } from '@/lib/software-storefront-fulfillment';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import styles from '../checkout.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Software payment status',
  description: 'Check the status of your software inquiry payment.',
};

export default async function SoftwareCheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  const purchaseId = typeof params.purchase_id === 'string' ? params.purchase_id : '';
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/software/checkout/complete?purchase_id=${purchaseId}`)}`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(purchaseId)) notFound();

  const [record] = await query<{
    stripe_payment_intent_id: string | null;
    item_name: string;
    amount_paid_cents: number;
    currency: string;
    status: 'pending' | 'partially_paid' | 'paid' | 'failed';
    total_price_cents: number;
    inquiry_status: string;
  }>(
    `select stripe_payment_intent_id,item_name,amount_paid_cents,total_price_cents,currency,status,inquiry_status
     from software_storefront_purchases where id=$1 and user_id=$2`,
    [purchaseId, user.id],
  );
  if (!record) notFound();

  let purchase = record;
  let confirmationIssue = false;
  if (record.stripe_payment_intent_id && record.status === 'pending') {
    const stripe = await verifiedStripe();
    const intent = await stripe.paymentIntents.retrieve(record.stripe_payment_intent_id);
    if (intent.metadata.app !== 'onefin-software-store' ||
        intent.metadata.billing_scope !== 'software' ||
        intent.metadata.user_id !== user.id ||
        intent.metadata.purchase_id !== purchaseId ||
        !stripeObjectMatchesMode(intent.livemode)) notFound();
    if (intent.status === 'succeeded' || intent.status === 'canceled') {
      try {
        await fulfillSoftwareStorefrontPayment(stripe, {
          id: `software-purchase-return:${intent.id}`,
          type: intent.status === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.canceled',
          livemode: intent.livemode,
          data: { object: intent },
        } as unknown as Stripe.Event);
      } catch (error) {
        console.error('Unable to fulfill Software payment return:', error);
        confirmationIssue = true;
      }
      const [updated] = await query<typeof record>(
        `select stripe_payment_intent_id,item_name,amount_paid_cents,total_price_cents,currency,status,inquiry_status
         from software_storefront_purchases where id=$1 and user_id=$2`,
        [purchaseId, user.id],
      );
      if (updated) purchase = updated;
    }
  }

  const paidAmount = Math.max(0, purchase.amount_paid_cents || 0);
  const agreedTotal = Math.max(0, purchase.total_price_cents || 0);
  const remainingBalance = Math.max(0, agreedTotal - paidAmount);
  const fullyPaid = purchase.status === 'paid' && remainingBalance === 0;
  const partiallyPaid =
    purchase.status === 'partially_paid' || (paidAmount > 0 && remainingBalance > 0 && purchase.status !== 'paid');
  const failed = purchase.status === 'failed';

  const eyebrow = fullyPaid
    ? 'FULLY PAID'
    : partiallyPaid
      ? 'PAYMENT RECEIVED'
      : failed
        ? 'PAYMENT NOT COMPLETED'
        : 'PAYMENT PROCESSING';
  const title = fullyPaid
    ? 'Your project is fully paid.'
    : partiallyPaid
      ? 'Your payment was received.'
      : failed
        ? 'Your payment was not completed.'
        : 'We are confirming your payment.';
  const intro = fullyPaid
    ? `Your payments totaling $${(paidAmount / 100).toFixed(2)} ${purchase.currency.toUpperCase()} cover the agreed project price for ${purchase.item_name}. Our team will follow up at ${user.email}.`
    : partiallyPaid
      ? `A successful payment of $${(paidAmount / 100).toFixed(2)} ${purchase.currency.toUpperCase()} was applied to ${purchase.item_name}. Remaining balance: $${(remainingBalance / 100).toFixed(2)}. This deposit is not full payment.`
      : failed
        ? `The payment for ${purchase.item_name} did not complete. No successful payment was applied to the balance.`
        : confirmationIssue
          ? `Stripe returned a payment status for ${purchase.item_name}, but we could not finish processing. Please contact support with reference ${purchaseId}.`
          : `The payment for ${purchase.item_name} is still being confirmed. Only verified successful payments reduce the remaining balance.`;

  return (
    <div className={styles.shell}>
      <section className={styles.card} aria-live="polite">
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        <div className={styles.summary}>
          <span>Software purchase</span>
          <strong>{purchase.item_name}</strong>
          <div><span>Agreed total</span><b>${(agreedTotal / 100).toFixed(2)} USD</b></div>
          <div><span>Total paid</span><b>${(paidAmount / 100).toFixed(2)} USD</b></div>
          <div><span>Remaining</span><b>${(remainingBalance / 100).toFixed(2)} USD</b></div>
          <div><span>Payment status</span><b>{purchase.status}</b></div>
          <div><span>Project status</span><b>{purchase.inquiry_status || 'inquiry'}</b></div>
        </div>
        <div className="button-row">
          <Link className={styles.back} href="/software/account">Open Software account</Link>
          <Link className={styles.back} href="/software">Return to software catalog</Link>
        </div>
      </section>
    </div>
  );
}
