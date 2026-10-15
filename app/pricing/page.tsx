import { Suspense } from 'react';
import Link from 'next/link';
import { PageHeading } from '@/components/page-heading';
import { BillingStatusBanner } from '@/components/billing-status-banner';
import { plans, priceLabel } from '@/lib/plans';
import { billingEnvironment } from '@/lib/billing-environment';

export const metadata = {
  title: 'AI Chat Plans and Workspace Credits',
  description: 'Compare One Fin Solution chat subscriptions and learn about separate one-time Workspace credit packs.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    type: 'website',
    siteName: 'One Fin Solution',
    title: 'AI Chat Plans and Workspace Credits',
    description: 'Compare chat subscriptions and separate Workspace credit packs.',
    url: '/pricing',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};

export default function Pricing() {
  const mode = billingEnvironment();

  return (
    <div className="page-wrap">
      <Suspense fallback={null}>
        <BillingStatusBanner />
      </Suspense>
      <PageHeading
        eyebrow="PLANS & PRICING"
        title="Choose the time that fits your work."
        description="Homepage chat subscriptions include unlimited responses during an active trial or paid period. Choose your billing interval and start with a card-backed free trial."
      />
      <div className="notice">
        {mode === 'test'
          ? 'Sandbox billing: these are the configured plan prices. Payments are in test mode; no real charges are taken.'
          : 'Secure live billing: subscription payments are processed by Stripe.'}
      </div>
      <section className="pricing-grid" aria-label="All four personal plans">
        {plans
          .filter((plan) => plan.key !== 'custom')
          .map((plan) => (
            <article className={`panel price-card ${plan.key === 'monthly' ? 'featured' : ''}`} key={plan.key}>
              <span className="eyebrow">{plan.trialDays}-DAY FREE TRIAL</span>
              <h2>{plan.name}</h2>
              <div className="price">
                ${plan.amount / 100}
                <small> USD / {plan.interval}</small>
              </div>
              <p>Unlimited homepage chat during your trial and active paid membership.</p>
              <ul>
                <li>Valid payment card required before trial starts</li>
                <li>Then {priceLabel(plan)}, billed automatically</li>
                <li>Cancel before the trial ends to avoid the first charge</li>
                <li>Switch plans later; the change applies at next renewal</li>
              </ul>
              <Link className="button" href={`/subscribe?plan=${plan.key}&mode=trial`}>
                Start free trial
              </Link>
              <Link className="text-link" href={`/subscribe?plan=${plan.key}&mode=paid`}>
                Or subscribe now
              </Link>
            </article>
          ))}
      </section>
      <section className="panel">
        <h2>Workspace credits (separate)</h2>
        <p>
          Workspace AI uses a separate one-time credit pack. Buy credits when you need them from Workspace settings on
          this same site.
        </p>
        <Link className="button secondary" href="/workspace">
          Open Workspace
        </Link>
      </section>
      <section className="panel">
        <h2>Business</h2>
        <p>Need seats, invoicing, or a custom agreement? Contact sales and we will configure the right plan.</p>
        <Link className="button secondary" href="/contact">
          Contact sales
        </Link>
      </section>
    </div>
  );
}
