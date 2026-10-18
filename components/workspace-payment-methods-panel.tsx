'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  listWorkspacePaymentMethods,
  removeWorkspacePaymentMethod,
  setWorkspaceDefaultPaymentMethod,
  startWorkspaceCardSetupCheckout,
} from '@/app/workspace-actions';

/** Manage Workspace-only cards through hosted Stripe Checkout. */
export function WorkspacePaymentMethodsPanel() {
  const [methods, setMethods] = useState<Array<{ id: string; brand: string; last4: string; isDefault?: boolean; expMonth?: number | null; expYear?: number | null }>>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError('');
      const result = await listWorkspacePaymentMethods();
      if (!result || ('error' in result && result.error)) {
        setError(String((result as { error?: string })?.error || 'Unable to load cards.'));
        setMethods([]);
        return;
      }
      setMethods(((result as { methods?: typeof methods }).methods || []) as typeof methods);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function addCard() {
    startTransition(async () => {
      setError('');
      const result = await startWorkspaceCardSetupCheckout();
      if ('error' in result && result.error) { setError(result.error); return; }
      if (!('url' in result) || !result.url) { setError('Unable to open secure card setup.'); return; }
      window.location.assign(result.url);
    });
  }

  return (
    <div className="stack gap-md">
      <div>
        <h3>Workspace payment methods</h3>
        <p className="muted small">
          Cards appear after a successful credit purchase. Add credits to save a card — there is no separate setup step.
        </p>
      </div>
      <div className="row gap-sm">
        <button type="button" className="button secondary" disabled={pending} onClick={addCard}>
          {pending ? 'Opening secure card setup…' : 'Add card'}
        </button>
        <button type="button" className="button secondary" disabled={pending} onClick={refresh}>Refresh</button>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {methods.length === 0 ? (
        <p className="muted small">No workspace cards yet. Buy credits to pay and save a card in one step.</p>
      ) : (
        <ul className="stack gap-sm">
          {methods.map((method) => (
            <li key={method.id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{method.brand} •••• {method.last4}</strong>
                {method.isDefault ? <span className="muted"> (default)</span> : null}
              </div>
              <div className="row gap-sm">
                {!method.isDefault ? (
                  <button type="button" className="button secondary" disabled={pending} onClick={() => startTransition(async () => {
                    setError('');
                    const r = await setWorkspaceDefaultPaymentMethod(method.id);
                    if (r && 'error' in r && r.error) setError(String(r.error));
                    else { setNotice('Default updated.'); window.dispatchEvent(new Event('workspace-payment-methods-changed')); refresh(); }
                  })}>Make default</button>
                ) : null}
                <button type="button" className="button secondary" disabled={pending} onClick={() => startTransition(async () => {
                  setError('');
                  const r = await removeWorkspacePaymentMethod(method.id);
                  if (r && 'error' in r && r.error) setError(String(r.error));
                  else { setNotice('Card removed.'); window.dispatchEvent(new Event('workspace-payment-methods-changed')); refresh(); }
                })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
