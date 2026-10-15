import { Suspense } from 'react';
import Link from 'next/link';
import { PaymentMethodsPanel } from '@/components/payment-methods-panel';
import planIds from '@/billing/personal-plan-ids.json';
import { findPlan, plans, priceLabel } from '@/lib/plans';
import { currentUser } from '@/lib/session';
import { ownedQuery } from '@/lib/db';
import { redirect } from 'next/navigation';
import { readPreferences } from '@/lib/account-service';
import { accountDate } from '@/lib/dashboard';
import { PageHeading } from '@/components/page-heading';
import { BillingCard } from '@/components/billing-card';
import { PlanSwitcher } from '@/components/plan-switcher';
import { PlanManagement } from '@/components/plan-management';
import { BillingStatusBanner } from '@/components/billing-status-banner';

function planTitle(priceId: string) {
  const key = Object.entries(planIds.prices).find(([, id]) => id === priceId)?.[0];
  return key ? `${findPlan(key).name} - ${priceLabel(findPlan(key))}` : 'Legacy subscription';
}

export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ setup_intent?: string }>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const [subscriptions, settings] = await Promise.all([
    ownedQuery(
      user.id,
      'select id,price_id,status,period_start::text,period_end::text,cancel_at_period_end,observed_at::text,next_plan_key,next_plan_at::text,trial_end::text from billing_subscriptions where user_id=$1 order by observed_at desc',
      [user.id],
    ),
    readPreferences(user.id),
  ]);

  return (
    <div className="page-wrap">
      <Suspense fallback={null}>
        <BillingStatusBanner />
      </Suspense>
      <PageHeading
        eyebrow="DASHBOARD / HOMEPAGE CHAT"
        title="Chat subscription billing."
        description="Review your homepage chat membership and manage its renewals. Workspace credits and purchases are managed separately in Workspace."
      />
      <div className="button-row">
        <Link className="button" href="/pricing">
          Compare chat plans
        </Link>
        <Link className="text-link" href="/workspace">
          Manage Workspace credits
        </Link>
        <Link className="text-link" href="/contact?category=billing">
          Billing help & invoice requests
        </Link>
      </div>
      <section className="stack">
        {subscriptions.length ? (
          subscriptions.map((sub) => {
            const currentPlanKey = Object.entries(planIds.prices).find(([, id]) => id === sub.price_id)?.[0] || null;
            const currentPlan = plans.find((plan) => plan.key === currentPlanKey);
            const nextPlan = plans.find((plan) => plan.key === sub.next_plan_key);
            return (
            <article className="panel" key={sub.id}>
              <div className="flex justify-between gap-4">
                <h2>{planTitle(sub.price_id)}</h2>
                <span className="badge">{sub.status}</span>
              </div>
              <p className="small-copy break-all">Reference: {sub.id}</p>
              <p>
                {sub.cancel_at_period_end ? 'Paid access ends' : 'Recorded period ends'}:{' '}
                {accountDate(sub.period_end, settings.timezone)}
              </p>
              <p className="small-copy">
                Last synchronized: {accountDate(sub.observed_at, settings.timezone)}. Updates appear after payment
                provider confirmation.
              </p>
              {sub.trial_end && sub.status === 'trialing' && (
                <p>
                  First automatic payment: {accountDate(sub.trial_end, settings.timezone)}. Cancel before this time to
                  avoid the charge.
                </p>
              )}
              {sub.next_plan_key && (
                <p className="notice">
                  Scheduled change: {sub.next_plan_key} on {accountDate(sub.next_plan_at, settings.timezone)}.
                </p>
              )}
              {['active', 'trialing', 'past_due'].includes(sub.status) && (
                <PlanManagement id={sub.id} cancelled={sub.cancel_at_period_end} />
              )}
              {['active', 'trialing'].includes(sub.status) && !sub.cancel_at_period_end && currentPlanKey ? (
                <PlanSwitcher
                  currentPlanKey={currentPlanKey}
                  currentPriceLabel={currentPlan ? priceLabel(currentPlan) : null}
                  renewalDate={sub.period_end}
                  scheduledPlanKey={plans.some((plan) => plan.key === sub.next_plan_key) ? sub.next_plan_key : null}
                  scheduledPlanName={nextPlan?.name || null}
                  scheduledPriceLabel={nextPlan ? priceLabel(nextPlan) : null}
                  scheduledDate={sub.next_plan_at}
                />
              ) : null}
            </article>
          )})
        ) : (
          <article className="panel empty-state">
            <h2>No homepage chat subscription recorded.</h2>
            <p>Choose a Daily, Weekly, Monthly, or Yearly plan to use the homepage chat.</p>
            <Link className="text-link" href="/pricing">
              View chat plans →
            </Link>
          </article>
        )}
      </section>
      <section className="panel stack section-space">
        <div>
          <h2>Payment methods</h2>
          <p className="muted">Add, update, remove, or set a default card for homepage chat billing.</p>
        </div>
        <PaymentMethodsPanel />
      </section>

      {subscriptions.length > 0 && /^pk_test_/.test(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '') && (
        <BillingCard
          publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
          unpaidIds={subscriptions.filter((sub) => ['past_due', 'incomplete'].includes(sub.status)).map((sub) => sub.id)}
          resumeSetup={params.setup_intent}
        />
      )}
      <div className="notice">
        This page manages homepage chat subscriptions only. Workspace credit purchases and payment methods are separate.
        Need an invoice copy or a payment correction?{' '}
        <Link className="text-link" href="/contact?category=billing">
          Submit a billing request
        </Link>
        . Review our{' '}
        <Link className="text-link" href="/payment-policy">
          payment, cancellation, and refund terms
        </Link>
        .
      </div>
    </div>
  );
}
