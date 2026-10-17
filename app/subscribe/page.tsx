import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubscriptionForm } from '@/components/subscription-form';
import { findPlan, priceLabel } from '@/lib/plans';
import { currentUser } from '@/lib/session';

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; mode?: string; setup?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const params = await searchParams;
  const plan = findPlan(params.plan || '');
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
          ? `${plan.trialDays}-day free trial with no card setup now. Pay ${priceLabel(plan)} when the trial ends (or subscribe & pay now).`
          : `Pay ${priceLabel(plan)} now to subscribe. No separate card-setup step.`}
      </p>
      <p className="muted">Signed in as {user.email}</p>
      <SubscriptionForm planKey={plan.key} resumeSetup={params.setup} />
      <p>
        <Link className="text-link" href="/pricing?billing=cancelled">
          Cancel and return to pricing
        </Link>
      </p>
    </div>
  );
}
