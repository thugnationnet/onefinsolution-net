'use client';
import { useState, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Link from 'next/link';
import { prepareSubscription, finishSubscription } from '@/app/subscription-actions';
import { findPlan, priceLabel } from '@/lib/plans';
import { publicSitePath } from '@/lib/site-url';

function CardForm({
  planKey,
  mode,
  setupId,
  confirmKind,
  complete,
}: {
  planKey: string;
  mode: 'trial' | 'paid';
  setupId: string;
  confirmKind: 'payment' | 'setup';
  complete: (value: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const plan = findPlan(planKey);
  const setupReturnUrl = publicSitePath(`/subscribe?plan=${encodeURIComponent(planKey)}&mode=${mode}`);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !consent) return;
    setBusy(true);
    setError('');
    try {
      // Confirm the REAL subscription invoice (or $0 trial setup). No separate card-save step.
      const result =
        confirmKind === 'setup'
          ? await stripe.confirmSetup({
              elements,
              confirmParams: { return_url: setupReturnUrl },
              redirect: 'if_required',
            })
          : await stripe.confirmPayment({
              elements,
              confirmParams: { return_url: setupReturnUrl },
              redirect: 'if_required',
            });
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
          I authorize One Fin to charge {priceLabel(plan)}{' '}
          {mode === 'trial' ? `after my ${plan.trialDays}-day free trial` : 'in this step'}, save this card for renewals until I cancel. I agree to
          the{' '}
          <Link className="text-link" href={publicSitePath('/payment-policy')}>
            payment and cancellation terms
          </Link>
          .
        </span>
        <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy || !stripe || !consent}>
        {busy ? 'Processing…' : mode === 'trial' ? 'Start free trial' : 'Pay & subscribe'}
      </button>
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
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        try {
          const result = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: paymentReturnUrl },
            redirect: 'if_required',
          });
          if (result.error) setError(result.error.message || 'Payment failed.');
          else done();
        } finally {
          setBusy(false);
        }
      }}
    >
      <PaymentElement />
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={!stripe || busy}>
        {busy ? 'Confirming...' : 'Confirm payment'}
      </button>
    </form>
  );
}

export function SubscriptionForm({
  planKey,
  mode,
  publishableKey,
  resumeSetup,
}: {
  planKey: string;
  mode: 'trial' | 'paid';
  publishableKey: string;
  resumeSetup?: string;
}) {
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const [setup, setSetup] = useState<{ clientSecret: string; setupId: string; confirmKind: 'payment' | 'setup' } | null>(null);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const billingUrl = '/dashboard/billing?billing=success';
  const cancelledUrl = '/pricing?billing=cancelled';
  const workspaceUrl = '/workspace';

  async function complete(id: string) {
    const result = await finishSubscription(id, true);
    if (result.error) throw new Error(result.error);
    if (result.data?.paymentSecret) setPaymentSecret(result.data.paymentSecret);
    else
      setNotice(
        result.data?.status === 'trialing'
          ? `Your trial has started. First automatic payment: ${new Date(result.data.trialEnd!).toLocaleString()}.`
          : 'Your subscription request is recorded. Paid access appears after payment confirmation.',
      );
  }

  if (notice)
    return (
      <div className="notice success" role="status">
        <p>{notice}</p>
        <Link className="button" href={billingUrl}>
          Manage your plan
        </Link>
        <Link className="text-link" href={workspaceUrl}>
          Open workspace
        </Link>
      </div>
    );

  if (paymentSecret)
    return (
      <div className="stack">
        <Elements stripe={stripe} options={{ clientSecret: paymentSecret }} key={paymentSecret}>
          <PaymentConfirmation
            done={() => {
              setNotice('Payment submitted. Your access updates after verified payment confirmation.');
              location.assign(billingUrl);
            }}
          />
        </Elements>
        <p>
          <a className="text-link" href={cancelledUrl}>
            Cancel and return to pricing
          </a>
        </p>
      </div>
    );

  return (
    <div className="stack">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {setup ? (
        <Elements stripe={stripe} options={{ clientSecret: setup.clientSecret }} key={setup.clientSecret}>
          <CardForm
            planKey={planKey}
            mode={mode}
            setupId={setup.setupId}
            confirmKind={setup.confirmKind}
            complete={complete}
          />
        </Elements>
      ) : (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              if (resumeSetup) await complete(resumeSetup);
              else {
                const result = await prepareSubscription(planKey, mode);
                if (result.error) throw new Error(result.error);
                if (result.data?.clientSecret && result.data.setupId) {
                  setSetup({
                    clientSecret: result.data.clientSecret,
                    setupId: result.data.setupId,
                    confirmKind: result.data.confirmKind === 'setup' ? 'setup' : 'payment',
                  });
                } else if (result.data?.subscriptionId && !result.data.clientSecret) {
                  setNotice('Your subscription is already active.');
                } else if (result.data) {
                  throw new Error('Unable to start checkout.');
                }
              }
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? 'Preparing...'
            : resumeSetup
              ? 'Accept displayed terms & finish subscription'
              : 'Continue to payment'}
        </button>
      )}
      <p>
        <a className="text-link" href={cancelledUrl}>
          Cancel and return to pricing
        </a>
      </p>
    </div>
  );
}
