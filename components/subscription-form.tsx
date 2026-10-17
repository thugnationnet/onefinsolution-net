'use client';
import { useState, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Link from 'next/link';
import { prepareSubscription, finishSubscription } from '@/app/subscription-actions';
import { findPlan, priceLabel } from '@/lib/plans';
import { publicSitePath } from '@/lib/site-url';

function PayForm({ planKey, mode, setupId, complete }: { planKey: string; mode: 'trial' | 'paid'; setupId: string; complete: (value: string) => Promise<void>; }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const plan = findPlan(planKey);
  const returnUrl = publicSitePath(`/subscribe?plan=${encodeURIComponent(planKey)}&mode=${mode}&done=1`);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !consent) return;
    setBusy(true);
    setError('');
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (result.error) throw new Error(result.error.message);
      await complete(setupId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <PaymentElement />
      <label className="setting-row">
        <span>
          I authorize One Fin to charge {priceLabel(plan)} starting today and on each renewal until I cancel. I agree to the{' '}
          <Link className="text-link" href={publicSitePath('/payment-policy')}>payment and cancellation terms</Link>.
        </span>
        <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
      </label>
      {error && <p role="alert" className="notice error">{error}</p>}
      <button className="button" disabled={busy || !stripe || !consent}>{busy ? 'Processing…' : 'Pay & subscribe'}</button>
      <p className="muted small">You pay the plan amount in this step. There is no separate card setup.</p>
    </form>
  );
}

function PaymentConfirmation({ done }: { done: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const paymentReturnUrl = publicSitePath('/dashboard/billing?billing=action_required');
  return (
    <form className="stack" onSubmit={async (event) => {
      event.preventDefault();
      if (!stripe || !elements) return;
      setBusy(true); setError('');
      try {
        const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: paymentReturnUrl }, redirect: 'if_required' });
        if (result.error) throw new Error(result.error.message);
        done();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Please try again.');
      } finally { setBusy(false); }
    }}>
      <PaymentElement />
      {error && <p role="alert" className="notice error">{error}</p>}
      <button className="button" disabled={busy || !stripe}>{busy ? 'Confirming…' : 'Confirm payment'}</button>
    </form>
  );
}

export function SubscriptionForm({ planKey, resumeSetup, paymentSecret }: { planKey: string; resumeSetup?: string | null; paymentSecret?: string | null; }) {
  const plan = useMemo(() => findPlan(planKey), [planKey]);
  const [mode, setMode] = useState<'trial' | 'paid'>(plan.trialDays > 0 ? 'trial' : 'paid');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [setup, setSetup] = useState<{ clientSecret: string; setupId: string } | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState(paymentSecret || '');
  const stripe = useMemo(() => (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null), []);
  const cancelledUrl = publicSitePath('/pricing');

  async function complete(setupId: string) {
    const result = await finishSubscription(setupId, true);
    if (result.error) throw new Error(result.error);
    if (result.data?.paymentSecret) {
      setPaymentClientSecret(result.data.paymentSecret);
      setSetup(null);
      setNotice('Additional payment confirmation is required to finish.');
      return;
    }
    setNotice(mode === 'trial' ? 'Trial started. Your plan is active.' : 'Subscription active. Thank you.');
    setSetup(null);
  }

  if (!stripe) return <p className="notice error">Payments are not configured.</p>;

  if (paymentClientSecret) {
    return (
      <div className="stack">
        {notice && <p className="notice">{notice}</p>}
        <Elements stripe={stripe} options={{ clientSecret: paymentClientSecret }} key={paymentClientSecret}>
          <PaymentConfirmation done={() => { setNotice('Payment submitted.'); setPaymentClientSecret(''); }} />
        </Elements>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <h2>{plan.name}</h2>
        <p className="muted">
          {mode === 'trial'
            ? `${plan.trialDays}-day free trial with no card setup now.`
            : `Subscribe now — pay ${priceLabel(plan)} in this step. No separate card setup.`}
        </p>
      </div>
      {plan.trialDays > 0 && !setup ? (
        <div className="row gap-sm">
          <button type="button" className={mode === 'trial' ? 'button' : 'button secondary'} onClick={() => setMode('trial')} disabled={busy}>Free trial</button>
          <button type="button" className={mode === 'paid' ? 'button' : 'button secondary'} onClick={() => setMode('paid')} disabled={busy}>Subscribe & pay</button>
        </div>
      ) : null}
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {setup ? (
        <Elements stripe={stripe} options={{ clientSecret: setup.clientSecret }} key={setup.clientSecret}>
          <PayForm planKey={planKey} mode={mode} setupId={setup.setupId} complete={complete} />
        </Elements>
      ) : (
        <button className="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            if (resumeSetup) await complete(resumeSetup);
            else {
              const result = await prepareSubscription(planKey, mode);
              if (result.error) throw new Error(result.error);
              if (result.data?.clientSecret && result.data.setupId) {
                setSetup({ clientSecret: result.data.clientSecret, setupId: result.data.setupId });
              } else if (result.data?.subscriptionId) {
                setNotice(mode === 'trial' ? 'Trial started. No card was required.' : 'Your subscription is active.');
              } else {
                throw new Error('Unable to start checkout.');
              }
            }
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Please try again.');
          } finally { setBusy(false); }
        }}>
          {busy ? 'Working…' : resumeSetup ? 'Accept terms & finish' : mode === 'trial' ? 'Start free trial' : 'Continue to payment'}
        </button>
      )}
      <p><a className="text-link" href={cancelledUrl}>Cancel and return to pricing</a></p>
    </div>
  );
}
