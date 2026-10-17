'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  confirmWorkspaceCreditCheckoutSession,
  startWorkspaceCreditCheckout,
} from '@/app/workspace-actions';
import {
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  formatWorkspaceCreditUsd,
} from '@/lib/workspace-credit-limits';

/**
 * Direct credit purchase only — hosted Checkout for the full amount.
 * No SetupIntent, no separate card-setup mode.
 */
export function WorkspaceCreditCheckout() {
  const [amountUsd, setAmountUsd] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const amountCents = useMemo(() => {
    const n = Number(amountUsd);
    if (!Number.isFinite(n)) return null;
    const cents = Math.round(n * 100);
    if (cents < WORKSPACE_CREDIT_MIN_AMOUNT_CENTS || cents > WORKSPACE_CREDIT_MAX_AMOUNT_CENTS) return null;
    return cents;
  }, [amountUsd]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id') || params.get('checkout_session_id');
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const result = await confirmWorkspaceCreditCheckoutSession({ sessionId });
        if (cancelled) return;
        if (result && 'error' in result && result.error) throw new Error(String(result.error));
        setNotice('Credits added. Thank you.');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not confirm payment.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function buy() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const started = await startWorkspaceCreditCheckout(amountUsd);
      if (started && 'error' in started && started.error) throw new Error(String(started.error));
      const url = (started as { url?: string }).url;
      if (!url) throw new Error('Unable to start checkout.');
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="stack gap-md">
      <div>
        <h2>Add workspace credits</h2>
        <p className="muted">
          Pay the credit amount directly. No separate card setup. Min {formatWorkspaceCreditUsd(WORKSPACE_CREDIT_MIN_AMOUNT_CENTS)}, max{' '}
          {formatWorkspaceCreditUsd(WORKSPACE_CREDIT_MAX_AMOUNT_CENTS)}.
        </p>
      </div>
      <label className="stack gap-xs">
        <span>Amount (USD)</span>
        <input
          type="number"
          min={WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100}
          max={WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100}
          step="1"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          disabled={busy}
        />
      </label>
      {amountCents ? <p className="muted">You will pay {formatWorkspaceCreditUsd(amountCents)} now.</p> : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}
      <button type="button" className="button" disabled={busy || !amountCents} onClick={() => void buy()}>
        {busy ? 'Redirecting…' : 'Pay & add credits'}
      </button>
      <p className="muted small">
        Workspace billing is separate from subscription billing.{' '}
        <Link href="/dashboard/billing">Plans & billing</Link>
      </p>
    </div>
  );
}
