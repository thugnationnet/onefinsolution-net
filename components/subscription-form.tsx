'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Script from 'next/script';
import type { StripeCheckoutForm, StripeCheckoutFormConfirmEvent } from '@stripe/stripe-js';
import { prepareSubscription } from '@/app/subscription-actions';
import { findPlan, priceLabel } from '@/lib/plans';

const appearance = {
  theme: 'stripe' as const,
  labels: 'auto' as const,
  inputs: 'spaced' as const,
  variables: {
    borderRadius: '4px',
    colorBackground: '#ffffff',
    colorDanger: '#df1b41',
    colorPrimary: '#0570de',
    colorSuccess: '#00c853',
    colorText: '#30313d',
    fontFamily: 'default',
    fontSizeBase: '16px',
    spacingUnit: '4px',
  },
};

export function SubscriptionForm({
  planKey,
  initialMode = 'trial',
  publishableKey,
}: {
  planKey: string;
  initialMode?: 'trial' | 'paid';
  publishableKey: string;
}) {
  const plan = findPlan(planKey);
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ clientSecret: string; sessionId: string } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const formContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session || !scriptReady || !formContainer.current) return;
    const checkoutSession = session;
    const container = formContainer.current;
    let cancelled = false;
    let submitting = false;
    let form: StripeCheckoutForm | null = null;
    let confirmHandler: ((event: StripeCheckoutFormConfirmEvent) => void) | undefined;

    async function mountCheckout() {
      try {
        const stripeConstructor = window.Stripe;
        if (!stripeConstructor) throw new Error('Secure payment form could not load. Refresh and try again.');
        const stripe = stripeConstructor(publishableKey);
        const checkout = stripe.initCheckoutFormSdk({
          clientSecret: checkoutSession.clientSecret,
          appearance,
        });
        form = checkout.createForm({ layout: 'expanded' });
        form.mount(container);
        const actionsResult = await checkout.loadActions();
        if (cancelled) return;
        if (actionsResult.type !== 'success') throw new Error(actionsResult.error.message);

        confirmHandler = async (event: StripeCheckoutFormConfirmEvent) => {
          if (submitting) return;
          submitting = true;
          setBusy(true);
          setError('');
          try {
            const result = await actionsResult.actions.confirm({ formConfirmEvent: event });
            if (result.type === 'error') throw new Error(result.error.message);
            window.location.assign(`/subscribe/return?session_id=${encodeURIComponent(checkoutSession.sessionId)}`);
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to complete subscription checkout.');
            submitting = false;
            setBusy(false);
          }
        };
        form.on('confirm', confirmHandler);
        setFormReady(true);
      } catch (failure) {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'Unable to load secure checkout.');
        }
      }
    }

    void mountCheckout();
    return () => {
      cancelled = true;
      if (form && confirmHandler) form.off('confirm', confirmHandler);
      form?.unmount();
    };
  }, [publishableKey, scriptReady, session]);

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await prepareSubscription(planKey, mode);
      if (result.error || !result.data?.clientSecret || !result.data.sessionId) {
        throw new Error(result.error || 'Checkout unavailable.');
      }
      setSession({ clientSecret: result.data.clientSecret, sessionId: result.data.sessionId });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to start subscription checkout.');
      setBusy(false);
    }
  }

  return (
    <>
      <Script
        src="https://js.stripe.com/dahlia/stripe.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setError('Secure payment form could not load. Refresh and try again.')}
      />
      {session ? (
        <div className="stack">
          <p className="muted">Secure Stripe subscription checkout</p>
          <div ref={formContainer} id="subscription-checkout-form" />
          {!formReady && !error ? <p role="status">Loading secure payment form…</p> : null}
          {busy ? <p role="status">Confirming subscription…</p> : null}
          {error ? <p role="alert" className="notice error">{error}</p> : null}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setSession(null);
              setFormReady(false);
              setError('');
            }}
          >
            Change plan or cancel
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={(event) => void startCheckout(event)}>
          <div className="button-row">
            <button type="button" className={mode === 'trial' ? 'button' : 'button secondary'} disabled={busy} onClick={() => setMode('trial')}>Free trial</button>
            <button type="button" className={mode === 'paid' ? 'button' : 'button secondary'} disabled={busy} onClick={() => setMode('paid')}>Subscribe &amp; pay</button>
          </div>
          <p>{mode === 'trial'
            ? `Start your ${plan.trialDays}-day free trial. Save a card securely at checkout; your plan renews at ${priceLabel(plan)} after the trial unless you cancel.`
            : `Subscribe at ${priceLabel(plan)}. Your card is saved securely for automatic renewals.`}</p>
          <p className="muted">Review the final amount and billing currency in secure Stripe Checkout.</p>
          {error ? <p role="alert" className="notice error">{error}</p> : null}
          <button type="submit" className="button" disabled={busy || !publishableKey}>
            {busy ? 'Preparing secure checkout…' : mode === 'trial' ? 'Start free trial' : 'Continue to subscription'}
          </button>
        </form>
      )}
    </>
  );
}
