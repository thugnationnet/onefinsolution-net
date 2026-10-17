'use client';
import { useState } from 'react';
import { prepareSubscription } from '@/app/subscription-actions';
import { findPlan, priceLabel } from '@/lib/plans';

export function SubscriptionForm({ planKey, initialMode = 'trial' }: { planKey: string; initialMode?: 'trial' | 'paid' }) {
  const plan = findPlan(planKey);
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="stack">
    <div className="button-row">
      <button type="button" className={mode === 'trial' ? 'button' : 'button secondary'} disabled={busy} onClick={() => setMode('trial')}>Free trial</button>
      <button type="button" className={mode === 'paid' ? 'button' : 'button secondary'} disabled={busy} onClick={() => setMode('paid')}>Subscribe & pay</button>
    </div>
    <p>{mode === 'trial'
      ? `Start your ${plan.trialDays}-day free trial. Save a card securely at checkout; your plan renews at ${priceLabel(plan)} after the trial unless you cancel.`
      : `Subscribe at ${priceLabel(plan)}. Your card is saved securely for automatic renewals.`}</p>
    <p className="muted">Review the final amount and billing currency on Stripe Checkout.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    <button type="button" className="button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try {
        const result = await prepareSubscription(planKey, mode);
        if (result.error || !result.data?.url) throw new Error(result.error || 'Checkout unavailable.');
        window.location.assign(result.data.url);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open checkout.'); setBusy(false); }
    }}>{busy ? 'Opening secure checkout…' : mode === 'trial' ? 'Start free trial on Stripe' : 'Continue to Stripe Checkout'}</button>
  </div>;
}
