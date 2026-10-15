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
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required.');

  return (
    <div className="page-wrap">
      <p className="eyebrow">Secure checkout</p>
      <h1>{mode === 'trial' ? `Start ${plan.name} free trial` : `Subscribe to ${plan.name}`}</h1>
      <p className="lede">
        {mode === 'trial'
          ? `Card required. ${priceLabel(plan)} after ${plan.trialDays} day${plan.trialDays === 1 ? '' : 's'} unless you cancel.`
          : `${priceLabel(plan)} starts after your card is verified.`}
      </p>
      <p className="muted">Signed in as {user.email}</p>
      <SubscriptionForm planKey={plan.key} mode={mode} publishableKey={publishableKey} resumeSetup={params.setup} />
      <p>
        <Link className="text-link" href="/pricing?billing=cancelled">
          Cancel and return to pricing
        </Link>
      </p>
    </div>
  );
}
