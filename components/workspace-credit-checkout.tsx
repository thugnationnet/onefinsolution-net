'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  WORKSPACE_CREDIT_AMOUNT_PRESETS_USD,
  WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  creditsFromAmountCents,
  formatWorkspaceCreditUsd,
} from '@/lib/workspace-credit-limits';
import {
  prepareWorkspaceCardUpdate,
  saveWorkspaceCard,
  startWorkspaceCreditCheckout,
} from '@/app/workspace-actions';

type Mode = 'credits' | 'card';

type Props = {
  mode: Mode;
  publishableKey: string;
  returnPath?: string;
  initialCredits?: number;
};

function CardSetupForm({ returnPath = '/workspace' }: { returnPath?: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || 'Check your card details.');
        setBusy(false);
        return;
      }
      const result = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}${returnPath}?billing=card_saved`,
        },
      });
      if (result.error) {
        setError(result.error.message || 'Unable to save card.');
        setBusy(false);
        return;
      }
      const setupIntentId = result.setupIntent?.id;
      if (setupIntentId) {
        const saved = await saveWorkspaceCard(setupIntentId);
        if (saved && 'error' in saved && saved.error) {
          setError(saved.error);
          setBusy(false);
          return;
        }
      }
      window.location.assign(`${returnPath}?billing=card_saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save card.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      <PaymentElement
        options={{
          layout: 'tabs',
          wallets: { applePay: 'never', googlePay: 'never' },
        }}
      />
      {error ? (
        <p role="alert" className="error-text" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <button type="submit" className="button" disabled={busy || !stripe || !elements}>
        {busy ? 'Saving…' : 'Save card for automatic top-ups'}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Your bank may ask you to verify the card once. We only use it for Workspace credit top-ups you enable.
      </p>
    </form>
  );
}

function CardSetupPanel({
  publishableKey,
  returnPath = '/workspace',
}: {
  publishableKey: string;
  returnPath?: string;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const result = await prepareWorkspaceCardUpdate();
      if ('error' in result && result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (!('clientSecret' in result) || !result.clientSecret) {
        setError('Unable to start card setup.');
        setLoading(false);
        return;
      }
      setClientSecret(result.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start card setup.');
    } finally {
      setLoading(false);
    }
  }

  if (!publishableKey) {
    return (
      <p className="error-text" role="alert">
        Card setup is temporarily unavailable (missing publishable key).
      </p>
    );
  }

  if (!clientSecret) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="lede" style={{ margin: 0 }}>
          Optional: save a card only if you want automatic low-balance reloads. For a first purchase,
          use <Link href="/checkout/credits">Add credits</Link> instead — no card save required.
        </p>
        {error ? (
          <p role="alert" className="error-text" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="button" className="button" disabled={loading} onClick={() => void start()}>
          {loading ? 'Preparing…' : 'Continue to save card'}
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'night' },
      }}
    >
      <CardSetupForm returnPath={returnPath} />
    </Elements>
  );
}

/**
 * Credits mode → Stripe-hosted Checkout (primary, low-friction).
 * Card mode → optional saved card for automatic top-ups only (not required to buy).
 */
export function WorkspaceCreditCheckout({
  mode,
  publishableKey,
  returnPath = '/workspace',
  initialCredits = 0,
}: Props) {
  const presets = WORKSPACE_CREDIT_AMOUNT_PRESETS_USD;
  const defaultUsd = WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS / 100;
  const minUsd = WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100;
  const maxUsd = WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100;

  const [amountUsd, setAmountUsd] = useState<string>(String(defaultUsd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedUsd = useMemo(() => {
    const n = Number(amountUsd);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }, [amountUsd]);

  const credits =
    parsedUsd != null && parsedUsd > 0
      ? creditsFromAmountCents(Math.round(parsedUsd * 100))
      : 0;

  async function payWithHostedCheckout() {
    setError(null);
    if (parsedUsd == null || parsedUsd < minUsd) {
      setError(`Minimum purchase is $${minUsd}.`);
      return;
    }
    if (parsedUsd > maxUsd) {
      setError(`Maximum purchase is $${maxUsd}.`);
      return;
    }
    setBusy(true);
    try {
      const result = await startWorkspaceCreditCheckout(parsedUsd);
      if ('error' in result && result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }
      if (!('url' in result) || !result.url) {
        setError('Checkout is temporarily unavailable. Please try again.');
        setBusy(false);
        return;
      }
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Checkout.');
      setBusy(false);
    }
  }

  if (mode === 'card') {
    return (
      <div className="workspace-credit-checkout" style={{ display: 'grid', gap: 16 }}>
        <CardSetupPanel publishableKey={publishableKey} returnPath={returnPath} />
        <p>
          <Link className="text-link" href="/checkout/credits">
            Prefer to buy credits once without saving a card?
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="workspace-credit-checkout" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Choose amount</h2>
        <p className="lede" style={{ margin: 0 }}>
          One-time payment via Stripe Checkout. Credits unlock immediately for API / flagship model
          usage. Your card is not saved for future charges on this purchase.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {presets.map(p => {
          const active = parsedUsd === p;
          return (
            <button
              key={p}
              type="button"
              className={active ? 'button' : 'button secondary'}
              disabled={busy}
              onClick={() => setAmountUsd(String(p))}
            >
              ${p}
            </button>
          );
        })}
      </div>

      <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
        <span>Custom amount (USD)</span>
        <input
          type="number"
          min={minUsd}
          max={maxUsd}
          step={1}
          value={amountUsd}
          disabled={busy}
          onChange={e => setAmountUsd(e.target.value)}
          className="input"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #333)',
            background: 'transparent',
            color: 'inherit',
            fontSize: 16,
          }}
        />
      </label>

      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--border, #333)',
          background: 'rgba(127,127,127,0.08)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div>
          <strong>{credits.toLocaleString()}</strong> credits
          {parsedUsd != null ? <> · {formatWorkspaceCreditUsd(Math.round(parsedUsd * 100))}</> : null}
        </div>
        {initialCredits > 0 ? (
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Current balance: {initialCredits.toLocaleString()} credits
          </div>
        ) : null}
        <div style={{ opacity: 0.75, marginTop: 4 }}>
          Encrypted checkout · card details stay with our payment partner
        </div>
      </div>

      {error ? (
        <p role="alert" className="error-text" style={{ margin: 0, fontSize: 14 }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void payWithHostedCheckout()}
        style={{ minHeight: 48, fontSize: 16 }}
      >
        {busy ? 'Opening secure checkout…' : 'Continue to secure checkout'}
      </button>

      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
        You&apos;ll finish payment on a secure checkout page, then return here with credits added
        automatically. Workspace cards are separate from chat subscription billing.
      </p>
    </div>
  );
}
