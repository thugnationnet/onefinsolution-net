import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WorkspaceCreditCheckout } from '@/components/workspace-credit-checkout';
import { currentUser } from '@/lib/session';

export const metadata = {
  title: 'Workspace payment method | One Fin Solution',
  robots: { index: false, follow: false },
};

export default async function CheckoutCardPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required.');

  return (
    <div className="page-wrap">
      <p className="eyebrow">Secure checkout</p>
      <h1>Save a Workspace payment card</h1>
      <p className="lede">
        Card details are handled by Stripe. One Fin stores only brand, last four digits, and expiry for your Workspace
        wallet.
      </p>
      <p className="muted">Signed in as {user.email}</p>
      <WorkspaceCreditCheckout mode="card" publishableKey={publishableKey} />
      <p>
        <Link className="text-link" href="/workspace?billing=cancelled">
          Cancel and return to Workspace
        </Link>
      </p>
    </div>
  );
}
