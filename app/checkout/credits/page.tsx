import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WorkspaceCreditCheckout } from '@/components/workspace-credit-checkout';
import { currentUser } from '@/lib/session';
import {
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  WORKSPACE_CREDITS_PER_USD,
} from '@/lib/workspace-credit-limits';

export const metadata = {
  title: 'Add Workspace credits | One Fin Solution',
  robots: { index: false, follow: false },
};

export default async function CheckoutCreditsPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const minUsd = (WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100).toFixed(0);
  const maxUsd = (WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100).toFixed(0);

  return (
    <div className="page-wrap">
      <p className="eyebrow">Secure checkout</p>
      <h1>Add Workspace credits</h1>
      <p className="lede">
        One-time payment through Stripe Checkout. Choose any amount from ${minUsd} to ${maxUsd}.
        Credits never expire and power Workspace AI / API tasks ($1 = {WORKSPACE_CREDITS_PER_USD}{' '}
        credits). Your card is not saved on this purchase.
      </p>
      <p className="muted">Signed in as {user.email}</p>
      <WorkspaceCreditCheckout
        mode="credits"
        publishableKey={publishableKey}
        returnPath="/workspace"
      />
      <p>
        <Link className="text-link" href="/workspace?billing=cancelled">
          Cancel and return to Workspace
        </Link>
      </p>
    </div>
  );
}
