import type { Metadata } from 'next';
import Link from 'next/link';
import { plans, priceLabel } from '@/lib/plans';
import {
  WORKSPACE_CREDIT_AMOUNT_PRESETS_USD,
  WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
  WORKSPACE_CREDITS_PER_USD,
} from '@/lib/workspace-credit-limits';

export const metadata: Metadata = {
  title: 'Pricing | One Fin Solution',
  description:
    'Buy Workspace credits for API and flagship model access. One-time Stripe Checkout — no forced subscription.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  const defaultUsd = WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS / 100;
  const presets = WORKSPACE_CREDIT_AMOUNT_PRESETS_USD;

  return (
    <div className="page-wrap">
      <p className="eyebrow">Pricing</p>
      <h1>Workspace credits for premium AI access</h1>
      <p className="lede">
        Pay once with Stripe Checkout on our secure domain. Credits unlock immediately for Workspace
        API / flagship model usage. No card is saved on first purchase. Subscriptions remain available
        only if you want recurring chat plans later.
      </p>

      <section className="panel" style={{ marginBottom: 28 }}>
        <p className="eyebrow">Primary</p>
        <h2 style={{ marginTop: 0 }}>Workspace credits</h2>
        <p>
          ${defaultUsd} default pack · custom amounts welcome · $1 = {WORKSPACE_CREDITS_PER_USD} credits.
          Popular packs: {presets.map(p => `$${p}`).join(', ')}.
        </p>
        <p>
          <Link className="button" href="/checkout/credits">
            Buy credits — secure checkout
          </Link>
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Checkout is hosted on <code>pay.onefinsolution.net</code> (Stripe custom domain).
        </p>
      </section>

      <h2>Optional chat subscriptions</h2>
      <p className="lede">
        These plans are optional. Most customers start with Workspace credits above.
      </p>
      <div className="price-grid">
        {plans
          .filter(p => p.key !== 'custom' && p.amount > 0)
          .map(plan => (
            <article key={plan.key} className="panel price-card">
              <h3>{plan.name}</h3>
              <p className="price">{priceLabel(plan)}</p>
              {plan.trialDays ? <p className="muted">{plan.trialDays}-day trial</p> : null}
              <p>
                <Link className="button secondary" href={`/subscribe?plan=${plan.key}`}>
                  View {plan.name}
                </Link>
              </p>
            </article>
          ))}
      </div>

      <p style={{ marginTop: 28 }}>
        Already signed in? Open your{' '}
        <Link className="text-link" href="/workspace">
          Workspace
        </Link>{' '}
        to buy credits or manage billing.
      </p>
    </div>
  );
}
