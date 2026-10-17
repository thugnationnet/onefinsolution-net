import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubscriptionForm } from '@/components/subscription-form';
import { findPlan, priceLabel } from '@/lib/plans';
import { currentUser } from '@/lib/session';

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; mode?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const params = await searchParams;
  let plan;
  try { plan = findPlan(params.plan || ''); } catch { redirect('/pricing'); }
  if (!plan || plan.key === 'custom') redirect('/pricing');
  const mode = params.mode === 'paid' ? 'paid' : 'trial';
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required.');
  }

  return (
    <div className="page-wrap">
      <p className="eyebrow">Secure checkout</p>
      <h1>{mode === 'trial' ? `Start ${plan.name} free trial` : `Subscribe to ${plan.name}`}</h1>
      <p className="lede">
        {mode === 'trial'
          ? `Try ${plan.name} free for ${plan.trialDays} days. Add your payment method securely on Stripe Checkout for renewal after the trial.`
          : `Pay ${priceLabel(plan)} on Stripe Checkout to subscribe.`}
      </p>
      <p className="muted">Signed in as {user.email}</p>
      <SubscriptionForm planKey={plan.key} initialMode={mode} />
      <p>
        <Link className="text-link" href="/pricing?billing=cancelled">
          Cancel and return to pricing
        </Link>
      </p>
    </div>
  );
}
