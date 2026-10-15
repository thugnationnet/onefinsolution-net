'use client';

import { useMemo, useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

export type SavedCardOption = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

type Props = {
  /** Module label shown in copy (Workspace / Software / Subscription). */
  scopeLabel: string;
  savedMethods: SavedCardOption[];
  /** When true, start with saved methods if any exist. */
  preferSaved?: boolean;
  /** Called with selected payment method id (or null when using a new card via PaymentElement). */
  onConfirm: (paymentMethodId: string | null) => Promise<void>;
  submitLabel?: string;
  busy?: boolean;
  error?: string;
  /** Optional note under the selector. */
  note?: string;
};

/**
 * Shared checkout UI for selecting a saved Stripe PaymentMethod or entering a new card.
 * Each payment module still uses its own Stripe Customer + PaymentIntent; this only standardizes UX.
 */
export function SavedPaymentMethodCheckout({
  scopeLabel,
  savedMethods,
  preferSaved = true,
  onConfirm,
  submitLabel = 'Pay now',
  busy = false,
  error = '',
  note,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const defaultId = useMemo(
    () => savedMethods.find((m) => m.isDefault)?.id || savedMethods[0]?.id || '',
    [savedMethods],
  );
  const [mode, setMode] = useState<'saved' | 'new'>(
    preferSaved && savedMethods.length > 0 ? 'saved' : 'new',
  );
  const [selectedId, setSelectedId] = useState(defaultId);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const isBusy = busy || localBusy;
  const showError = localError || error;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError('');
    setLocalBusy(true);
    try {
      if (mode === 'saved') {
        const id = selectedId || defaultId;
        if (!id) throw new Error(`Select a saved ${scopeLabel} payment method or add a new card.`);
        await onConfirm(id);
      } else {
        if (!stripe || !elements) throw new Error('Payment form is still loading.');
        const { error: submitError } = await elements.submit();
        if (submitError) throw new Error(submitError.message || 'Check your payment details.');
        // Parent confirms PaymentIntent with elements (new card path).
        await onConfirm(null);
      }
    } catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : 'Payment failed.');
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
      {savedMethods.length > 0 ? (
        <div className="stack" style={{ gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={mode === 'saved' ? 'button' : 'button secondary'}
              disabled={isBusy}
              onClick={() => setMode('saved')}
            >
              Use saved card
            </button>
            <button
              type="button"
              className={mode === 'new' ? 'button' : 'button secondary'}
              disabled={isBusy}
              onClick={() => setMode('new')}
            >
              Use a new card
            </button>
          </div>
          {mode === 'saved' ? (
            <label className="stack" style={{ gap: 6 }}>
              <span>{scopeLabel} payment method</span>
              <select
                value={selectedId || defaultId}
                disabled={isBusy}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {savedMethods.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.brand.toUpperCase()} ···· {card.last4}
                    {` · exp ${String(card.expMonth).padStart(2, '0')}/${card.expYear}`}
                    {card.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No saved {scopeLabel} cards yet. Enter a card below — it can be saved for next time.
        </p>
      )}

      {mode === 'new' || savedMethods.length === 0 ? <PaymentElement options={{ layout: 'tabs' }} /> : null}

      {note ? <p className="muted">{note}</p> : null}
      {showError ? (
        <p role="alert" className="notice error">
          {showError}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={isBusy || !stripe}>
        {isBusy ? 'Processing…' : submitLabel}
      </button>
    </form>
  );
}
