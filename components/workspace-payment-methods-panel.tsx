'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  listWorkspacePaymentMethods,
  removeWorkspacePaymentMethod,
  setWorkspaceDefaultPaymentMethod,
} from '@/app/workspace-actions';

/** List/manage cards saved after credit purchases — no SetupIntent add-card flow. */
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

  return (
    <div className="stack gap-md">
      <div>
        <h3>Workspace payment methods</h3>
        <p className="muted small">
          Cards appear after a successful credit purchase. Add credits to save a card — there is no separate setup step.
        </p>
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
                    else { setNotice('Default updated.'); refresh(); }
                  })}>Make default</button>
                ) : null}
                <button type="button" className="button secondary" disabled={pending} onClick={() => startTransition(async () => {
                  setError('');
                  const r = await removeWorkspacePaymentMethod(method.id);
                  if (r && 'error' in r && r.error) setError(String(r.error));
                  else { setNotice('Card removed.'); refresh(); }
                })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
