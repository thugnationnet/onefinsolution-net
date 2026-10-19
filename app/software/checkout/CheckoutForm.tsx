'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Script from 'next/script';
import type { StripeCheckoutForm, StripeCheckoutFormConfirmEvent } from '@stripe/stripe-js';
import { startSoftwareEmbeddedCheckout } from './actions';

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

export function CheckoutForm({
  kind,
  id,
  fullPrice,
  publishableKey,
}: {
  kind: 'template' | 'software';
  id: string;
  fullPrice: number;
  publishableKey: string;
}) {
  const [amount, setAmount] = useState(fullPrice.toFixed(2));
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ clientSecret: string; purchaseId: string } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
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
        if (!stripeConstructor) {
          throw new Error('Secure payment form could not load. Please refresh and try again.');
        }
        const stripe = stripeConstructor(publishableKey);
        const checkout = stripe.initCheckoutFormSdk({
          clientSecret: checkoutSession.clientSecret,
          appearance,
        });
        form = checkout.createForm({ layout: 'expanded' });
        form.mount(container);
        const actionsResult = await checkout.loadActions();
        if (cancelled) return;
        if (actionsResult.type !== 'success') {
          throw new Error(actionsResult.error.message);
        }
        confirmHandler = async (event: StripeCheckoutFormConfirmEvent) => {
          if (submitting) return;
          submitting = true;
          setIsPending(true);
          setError('');
          try {
            const result = await actionsResult.actions.confirm({ formConfirmEvent: event });
            if (result.type === 'error') throw new Error(result.error.message);
            window.location.assign(
              `/software/checkout/complete?purchase_id=${encodeURIComponent(checkoutSession.purchaseId)}`,
            );
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to complete this payment.');
            submitting = false;
            setIsPending(false);
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

  function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsPending(true);
    void (async () => {
      const result = await startSoftwareEmbeddedCheckout({
        kind,
        id,
        amount,
        purchaseId: crypto.randomUUID(),
      });
      if (result.clientSecret && result.purchaseId) {
        setSession({ clientSecret: result.clientSecret, purchaseId: result.purchaseId });
        setIsPending(false);
      } else {
        setError(result.error || 'Unable to prepare secure checkout. Please try again.');
        setIsPending(false);
      }
    })().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Unable to prepare secure checkout.');
      setIsPending(false);
    });
  }

  if (!publishableKey) {
    return <p className="software-checkout-error" role="alert">Secure payment is temporarily unavailable. Please contact our team.</p>;
  }

  return (
    <>
      <Script
        src="https://js.stripe.com/dahlia/stripe.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setError('Secure payment form could not load. Please refresh and try again.')}
      />
      {session ? (
        <div className="software-checkout-payment">
          <p className="software-checkout-secure-note">Secure Stripe Checkout · Your Software billing profile only</p>
          <div ref={formContainer} id="software-checkout-form" />
          {!formReady && !error ? <p role="status">Loading secure payment form…</p> : null}
          {isPending ? <p role="status">Confirming payment…</p> : null}
          {error ? <p className="software-checkout-error" role="alert">{error}</p> : null}
          <button
            type="button"
            className="software-checkout-cancel"
            disabled={isPending}
            onClick={() => {
              setSession(null);
              setFormReady(false);
              setError('');
            }}
          >
            Change amount or cancel
          </button>
        </div>
      ) : (
        <form className="software-checkout-form" onSubmit={startCheckout}>
          <label htmlFor="software-payment-amount">Choose your payment amount (USD)</label>
          <div className="software-checkout-amount">
            <span aria-hidden="true">$</span>
            <input
              id="software-payment-amount"
              type="number"
              min="5"
              max={fullPrice}
              step="0.01"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-describedby="software-payment-hint"
            />
            <span>USD</span>
          </div>
          <p id="software-payment-hint">Minimum $5.00. Full listed price: ${fullPrice.toFixed(2)} USD.</p>
          {error ? <p className="software-checkout-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={isPending}>
            {isPending ? 'Preparing secure payment…' : 'Continue to secure payment'}
          </button>
          <small>Payment is processed by Stripe. Subscription and Workspace payment details are not used.</small>
        </form>
      )}
    </>
  );
}
