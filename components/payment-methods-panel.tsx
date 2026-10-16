'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  detachPaymentMethodAction,
  finishCardUpdate,
  listPaymentMethodsAction,
  prepareCardUpdate,
  setDefaultPaymentMethodAction,
  type SavedPaymentMethod,
} from '@/app/payment-method-actions';
import { Button } from '@/components/ui/button';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

function AddCardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Unable to validate card.');
      setBusy(false);
      return;
    }
    const result = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });
    if (result.error) {
      setError(result.error.message || 'Card verification failed.');
      setBusy(false);
      return;
    }
    const setupId = result.setupIntent?.id;
    if (!setupId) {
      setError('Setup did not complete.');
      setBusy(false);
      return;
    }
    const finish = await finishCardUpdate(setupId);
    if ('error' in finish && finish.error) {
      setError(finish.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-3 rounded-xl border border-black/10 bg-white/70 p-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="button-row">
        <Button type="submit" disabled={busy || !stripe}>
          {busy ? 'Saving…' : 'Save payment method'}
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodsPanel({ compact = false }: { compact?: boolean }) {
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listPaymentMethodsAction();
    if ('error' in result) {
      setError(result.error);
      setMethods([]);
    } else {
      setMethods(result.methods);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const options = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: { theme: 'stripe' as const },
          }
        : undefined,
    [clientSecret],
  );

  async function startAddCard() {
    setMessage(null);
    setError(null);
    const prepared = await prepareCardUpdate();
    if ('error' in prepared || !prepared.secret) {
      setError(('error' in prepared && prepared.error) || 'Unable to start card setup.');
      return;
    }
    setClientSecret(prepared.secret);
  }

  async function makeDefault(id: string) {
    setBusyId(id);
    setMessage(null);
    setError(null);
    const result = await setDefaultPaymentMethodAction(id);
    if ('error' in result && result.error) setError(result.error);
    else setMessage(result.message || 'Default card updated.');
    await refresh();
    setBusyId(null);
  }

  async function removeCard(id: string) {
    setBusyId(id);
    setMessage(null);
    setError(null);
    const result = await detachPaymentMethodAction(id);
    if ('error' in result && result.error) setError(result.error);
    else setMessage(result.message || 'Card removed.');
    await refresh();
    setBusyId(null);
  }

  return (
    <div className={compact ? 'stack gap-3' : 'stack gap-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Subscription cards only</h3>
          <p className="muted text-sm">
            These cards pay Chat Plus plans and renewals only. They never charge workspace credits —
            save a separate card under Workspace → Credit reloads for auto-reload.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void startAddCard()}>
          {clientSecret ? 'Refresh card form' : 'Add payment method'}
        </Button>
      </div>

      {loading ? <p className="muted text-sm">Loading saved cards…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {!loading && methods.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 bg-white/50 p-4 text-sm text-slate-600">
          No cards on file yet. Add a payment method to manage renewals without leaving Settings.
        </p>
      ) : null}

      <ul className="stack gap-2">
        {methods.map((method) => (
          <li
            key={method.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium capitalize text-slate-900">
                {method.brand} ···· {method.last4}
                {method.isDefault ? (
                  <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                    Default
                  </span>
                ) : null}
              </p>
              <p className="muted text-xs">
                Expires {method.expMonth?.toString().padStart(2, '0') || '––'}/{method.expYear || '––––'}
              </p>
            </div>
            <div className="button-row">
              {!method.isDefault ? (
                <Button
                  type="button"
                  variant="outline"
                 
                  disabled={busyId === method.id}
                  onClick={() => void makeDefault(method.id)}
                >
                  Make default
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
               
                disabled={busyId === method.id}
                onClick={() => void removeCard(method.id)}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {clientSecret && options ? (
        <Elements stripe={stripePromise} options={options}>
          <AddCardForm
            onDone={() => {
              setClientSecret(null);
              setMessage('Payment method saved and set as default.');
              void refresh();
            }}
          />
        </Elements>
      ) : null}
    </div>
  );
}
