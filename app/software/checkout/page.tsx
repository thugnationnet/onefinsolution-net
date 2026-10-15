import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { readSoftwareBillingProfile } from '@/lib/software-billing-profile';
import { getSoftwarePurchaseItem } from '@/lib/software-purchase';
import { CheckoutForm } from './CheckoutForm';
import styles from './checkout.module.css';

export const metadata: Metadata = {
  title: 'Secure software checkout',
  description: 'Choose a USD payment amount and securely submit your software inquiry.',
};

export default async function SoftwareCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind = typeof params.kind === 'string' ? params.kind : undefined;
  const id = typeof params.id === 'string' ? params.id : undefined;
  const item = getSoftwarePurchaseItem(kind, id);
  if (!item) notFound();
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/software/checkout?kind=${kind}&id=${id}`)}`);
  const profile = await readSoftwareBillingProfile(user.id);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link className={styles.back} href="/software">← Back to software</Link>
        <span className={styles.eyebrow}>SOFTWARE STORE · USD</span>
        <h1>Start your inquiry</h1>
        <p className={styles.intro}>Signed in as <strong>{user.email}</strong>. Choose a payment amount for <strong>{item.name}</strong>. Once payment is confirmed, our team will receive your inquiry.</p>
        <div className={styles.summary}>
          <span>Selected {item.kind}</span>
          <strong>{item.name}</strong>
          <div><span>Listed price</span><b>${(item.priceCents / 100).toFixed(2)} USD</b></div>
          <div><span>Software billing name</span><b>{profile.billingName || profile.fullName || 'Not set'}</b></div>
          <div><span>Software billing address</span><b>{profile.billingLine1 || 'Not set'}</b></div>
        </div>
        <CheckoutForm
          kind={item.kind}
          id={item.id}
          fullPrice={item.priceCents / 100}
          publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}
        />
        <p className={styles.note}>Your selected amount is a payment toward this item. Our team will confirm any remaining scope or balance after reviewing the inquiry.</p>
      </div>
    </div>
  );
}
