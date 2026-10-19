import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { readSoftwareBillingProfile } from '@/lib/software-billing-profile';
import { SoftwareBillingManager } from './SoftwareBillingManager';
import styles from './software-account.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Software account and billing',
  description: 'Manage Software-only billing details, payment methods, and purchase history.',
  robots: { index: false, follow: false },
};

function formatMoney(minor: number, currency: string) {
  const normalizedCurrency = currency.toLowerCase() === 'thb' ? 'THB' : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
    maximumFractionDigits: normalizedCurrency === 'THB' ? 0 : 2,
  }).format(minor / 100);
}

export default async function SoftwareAccountPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Fsoftware%2Faccount');

  const [profile, purchases] = await Promise.all([
    readSoftwareBillingProfile(user.id),
    query<{
      id: string;
      item_name: string;
      amount_paid_cents: number;
      total_price_cents: number;
      currency: string;
      status: string;
      inquiry_status: string;
      created_at: string;
      paid_at: string | null;
    }>(
      `select id,item_name,amount_paid_cents,total_price_cents,currency,status,inquiry_status,
              created_at::text,paid_at::text
       from software_storefront_purchases where user_id=$1 order by created_at desc limit 100`,
      [user.id],
    ),
  ]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>SOFTWARE BILLING · THB</span>
        <h1>Your Software account</h1>
        <p>Signed in as {user.email}. This billing area has its own saved cards, addresses, and payment history, separate from your subscription and Workspace accounts.</p>
        <nav className={styles.nav} aria-label="Your billing areas">
          <Link href="/dashboard/billing">Subscription billing</Link>
          <Link href="/account">Workspace billing</Link>
          <Link href="/software">Software store</Link>
        </nav>
      </section>

      <SoftwareBillingManager
        profile={profile}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}
      />

      <section className={styles.section}>
        <h2>Software payment history</h2>
        <p>Stripe email receipts are sent on successful charges. Open a payment in Stripe or your email for the PDF receipt when available.</p>
        <p>Full-price Software purchases and project status. Contact support about balances from older purchases.</p>
        {purchases.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Product / ref</th><th>Total paid</th><th>Agreed total</th><th>Remaining</th><th>Payment / project</th><th>Date</th></tr></thead>
              <tbody>
                {purchases.map((purchase) => {
                  const paidAmount = Math.max(0, purchase.amount_paid_cents || 0);
                  const remaining = Math.max(0, purchase.total_price_cents - paidAmount);
                  const paymentLabel =
                    purchase.status === 'paid'
                      ? 'Paid in full'
                      : purchase.status === 'partially_paid'
                        ? 'Previously partially paid'
                        : purchase.status === 'failed'
                          ? 'Failed'
                          : 'Pending';
                  return (
                    <tr key={purchase.id}>
                      <td>
                        <div>{purchase.item_name}</div>
                        <div className={styles.muted}>Ref {purchase.id.slice(0, 8)}</div>
                      </td>
                      <td>{formatMoney(paidAmount, purchase.currency)}</td>
                      <td>{formatMoney(purchase.total_price_cents, purchase.currency)}</td>
                      <td>{formatMoney(remaining, purchase.currency)}</td>
                      <td>
                        <div>{paymentLabel}</div>
                        <div className={styles.muted}>Project: {purchase.inquiry_status || 'inquiry'}</div>
                      </td>
                      <td>{new Date(purchase.paid_at || purchase.created_at).toLocaleDateString('en-US')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p>No Software payments yet.</p>}
      </section>
    </div>
  );
}
