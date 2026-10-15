'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  confirmSoftwarePaymentWithSavedMethod,
  createSoftwareBalancePaymentIntent,
  listSoftwarePaymentMethods,
} from '@/app/software/checkout/actions';
import styles from './software-account.module.css';

const MIN_PARTIAL_USD = 5;

type SavedMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  isDefault?: boolean;
};

type PurchaseRow = {
  id: string;
  itemName: string;
  amountPaidCents: number;
  totalPriceCents: number;
  remainingCents: number;
  status: string;
};

function usd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function parseAmountUsd(raw: string, remainingCents: number): { ok: true; cents: number } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/[^0-9.]/g, '');
  if (!trimmed) {
    return { ok: false, error: 'Enter an amount to pay.' };
  }
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars)) {
    return { ok: false, error: 'Enter a valid dollar amount.' };
  }
  const cents = Math.round(dollars * 100);
  if (cents < MIN_PARTIAL_USD * 100) {
    return { ok: false, error: `Minimum payment is $${MIN_PARTIAL_USD}.00.` };
  }
  if (cents > remainingCents) {
    return {
      ok: false,
      error: `Amount cannot exceed the outstanding balance of ${usd(remainingCents)}.`,
    };
  }
  return { ok: true, cents };
}

function PayForm({
  purchase,
  clientSecret,
  amountLabel,
  savedMethods,
  onDone,
  onCancel,
}: {
  purchase: PurchaseRow;
  clientSecret: string;
  amountLabel: string;
  savedMethods: SavedMethod[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const defaultId = useMemo(
    () => savedMethods.find((m) => m.isDefault)?.id || savedMethods[0]?.id || '',
    [savedMethods],
  );
  const [mode, setMode] = useState<'saved' | 'new'>(savedMethods.length ? 'saved' : 'new');
  const [selectedId, setSelectedId] = useState(defaultId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedId(defaultId);
  }, [defaultId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe) return;
    setBusy(true);
    setError('');
    try {
      const returnUrl = `${window.location.origin}/software/account?paid=${encodeURIComponent(purchase.id)}`;

      if (mode === 'saved') {
        const paymentMethodId = selectedId || defaultId;
        if (!paymentMethodId) {
          throw new Error('Select a saved Software card or choose “Use a new card”.');
        }
        const confirmed = await confirmSoftwarePaymentWithSavedMethod({
          clientSecret,
          paymentMethodId,
          purchaseId: purchase.id,
        });
        if (confirmed.error === 'additional_action_required' && confirmed.clientSecret) {
          const next = await stripe.handleNextAction({ clientSecret: confirmed.clientSecret });
          if (next.error) throw new Error(next.error.message || 'Authentication failed.');
          if (next.paymentIntent && next.paymentIntent.status !== 'succeeded' && next.paymentIntent.status !== 'processing') {
            throw new Error(`Payment status: ${next.paymentIntent.status}`);
          }
        } else if (confirmed.error) {
          throw new Error(confirmed.error);
        }
      } else {
        if (!elements) throw new Error('Payment form is still loading.');
        const result = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: {
            return_url: returnUrl,
          },
        });
        if (result.error) throw new Error(result.error.message || 'Payment failed.');
        const status = result.paymentIntent?.status;
        if (status && status !== 'succeeded' && status !== 'processing') {
          throw new Error(`Payment status: ${status}`);
        }
      }
      onDone();
      window.location.href = `/software/account?paid=${encodeURIComponent(purchase.id)}`;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Payment failed.');
      setBusy(false);
    }
  }

  return (
    <form className={styles.profileForm} onSubmit={(event) => void onSubmit(event)}>
      <p>
        Paying <strong>{amountLabel}</strong> toward <strong>{purchase.itemName}</strong>. The outstanding balance
        updates only after Stripe confirms the charge.
      </p>
      {savedMethods.length > 0 ? (
        <div className={styles.fields} style={{ marginBottom: 12 }}>
          <div className={styles.payModeRow}>
            <button
              type="button"
              className={mode === 'saved' ? styles.primaryButton : styles.secondaryButton}
              onClick={() => setMode('saved')}
              disabled={busy}
            >
              Use saved card
            </button>
            <button
              type="button"
              className={mode === 'new' ? styles.primaryButton : styles.secondaryButton}
              onClick={() => setMode('new')}
              disabled={busy}
            >
              Use a new card
            </button>
          </div>
          {mode === 'saved' ? (
            <label className={styles.payMethodLabel}>
              <span>Software payment method</span>
              <select
                value={selectedId || defaultId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={busy}
              >
                {savedMethods.map((card) => (
                  <option key={card.id} value={card.id}>
                    {(card.brand || 'card').toUpperCase()} ···· {card.last4}
                    {card.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <p className={styles.muted}>No saved Software cards yet. Enter a new card below.</p>
      )}
      {mode === 'new' || savedMethods.length === 0 ? <PaymentElement options={{ layout: 'tabs' }} /> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.payActions}>
        <button type="submit" className={styles.primaryButton} disabled={!stripe || busy}>
          {busy ? 'Processing…' : `Pay ${amountLabel}`}
        </button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onCancel}>
          Change amount
        </button>
      </div>
    </form>
  );
}

export function SoftwareRemainingPay({
  purchases,
  publishableKey,
}: {
  purchases: PurchaseRow[];
  publishableKey: string;
}) {
  const open = purchases.filter((p) => p.remainingCents > 0 && p.status !== 'paid');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountLabel, setAmountLabel] = useState('');
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  useEffect(() => {
    void listSoftwarePaymentMethods()
      .then((result) => setSavedMethods(result.methods || []))
      .catch(() => setSavedMethods([]));
  }, []);

  if (!open.length) {
    return (
      <section className={styles.section} id="pay-remaining">
        <h2>Pay remaining balance</h2>
        <p>No partial Software purchases need another payment right now.</p>
      </section>
    );
  }

  const active = open.find((p) => p.id === activeId) || null;
  const amountPreview = active ? parseAmountUsd(amount, active.remainingCents) : null;

  function selectPurchase(purchase: PurchaseRow) {
    setActiveId(purchase.id);
    setClientSecret(null);
    setError('');
    // Default to full remaining, but the field is editable for any partial ≥ $5.
    setAmount((purchase.remainingCents / 100).toFixed(2));
  }

  async function startPay(purchase: PurchaseRow) {
    const parsed = parseAmountUsd(amount || String(purchase.remainingCents / 100), purchase.remainingCents);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError('');
    setActiveId(purchase.id);
    setClientSecret(null);
    try {
      const dollars = (parsed.cents / 100).toFixed(2);
      const result = await createSoftwareBalancePaymentIntent({
        purchaseId: purchase.id,
        amount: dollars,
        savePaymentMethod: true,
      });
      if (result.error || !result.clientSecret) {
        throw new Error(result.error || 'Unable to start remaining balance payment.');
      }
      if (result.amountCents && result.amountCents !== parsed.cents) {
        // Backend may clamp; reflect what will actually be charged.
        setAmount((result.amountCents / 100).toFixed(2));
      }
      setClientSecret(result.clientSecret);
      setAmountLabel(usd(result.amountCents || parsed.cents));
      if (Array.isArray(result.savedMethods) && result.savedMethods.length) {
        setSavedMethods(result.savedMethods);
      } else {
        const methods = await listSoftwarePaymentMethods();
        setSavedMethods(methods.methods || []);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to start payment.');
      setClientSecret(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} id="pay-remaining">
      <h2>Pay remaining balance</h2>
      <p>
        Partial payments show total paid and remaining balance. Pay any amount from ${MIN_PARTIAL_USD} up to the
        outstanding balance without starting a new purchase. Software saved cards appear automatically and stay
        isolated from Workspace and Subscription billing.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Paid</th>
              <th>Agreed</th>
              <th>Remaining</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {open.map((purchase) => (
              <tr key={purchase.id}>
                <td>
                  <div>{purchase.itemName}</div>
                  <div className={styles.muted}>Ref {purchase.id.slice(0, 8)}</div>
                </td>
                <td>{usd(purchase.amountPaidCents)}</td>
                <td>{usd(purchase.totalPriceCents)}</td>
                <td>{usd(purchase.remainingCents)}</td>
                <td>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy}
                    onClick={() => selectPurchase(purchase)}
                  >
                    {activeId === purchase.id ? 'Selected' : 'Pay remaining'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active ? (
        <div className={styles.remainingPanel}>
          <h3>{active.itemName}</h3>
          <p className={styles.muted}>
            Outstanding <strong>{usd(active.remainingCents)}</strong>. Enter any amount from $
            {MIN_PARTIAL_USD} to {(active.remainingCents / 100).toFixed(2)} (full balance).
          </p>
          <label className={styles.payAmountLabel}>
            <span>Amount to pay now (USD)</span>
            <div className={styles.payAmountRow}>
              <input
                type="number"
                min={MIN_PARTIAL_USD}
                max={active.remainingCents / 100}
                step="0.01"
                value={amount}
                disabled={busy || Boolean(clientSecret)}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                aria-label="Amount to pay now in USD"
              />
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || Boolean(clientSecret)}
                onClick={() => setAmount((active.remainingCents / 100).toFixed(2))}
              >
                Full balance
              </button>
            </div>
          </label>
          {amountPreview && !amountPreview.ok ? (
            <p className={styles.error}>{amountPreview.error}</p>
          ) : amountPreview?.ok ? (
            <p className={styles.muted}>
              You will pay <strong>{usd(amountPreview.cents)}</strong>
              {amountPreview.cents < active.remainingCents
                ? ` · remaining after this payment ${usd(active.remainingCents - amountPreview.cents)}`
                : ' · this clears the balance'}
              .
            </p>
          ) : null}
          {!clientSecret ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || !amountPreview || !amountPreview.ok}
              onClick={() => void startPay(active)}
            >
              {busy ? 'Preparing…' : 'Continue to payment'}
            </button>
          ) : null}
          {clientSecret && stripePromise ? (
            <div className={styles.payFormShell}>
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PayForm
                  purchase={active}
                  clientSecret={clientSecret}
                  amountLabel={amountLabel}
                  savedMethods={savedMethods}
                  onDone={() => {
                    setClientSecret(null);
                    setActiveId(null);
                  }}
                  onCancel={() => {
                    setClientSecret(null);
                    setError('');
                  }}
                />
              </Elements>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
