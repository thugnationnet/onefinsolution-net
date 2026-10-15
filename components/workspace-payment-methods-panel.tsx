'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listWorkspacePaymentMethods,
  removeWorkspacePaymentMethod,
  saveWorkspaceCard,
  setWorkspaceDefaultPaymentMethod,
} from '@/app/workspace-actions';
import type { WorkspaceSavedPaymentMethod } from '@/app/workspace-actions';
import { WorkspaceCreditCheckout } from '@/components/workspace-credit-checkout';

export function WorkspacePaymentMethodsPanel({ publishableKey }: { publishableKey: string }) {
  const router = useRouter();
  const [methods, setMethods] = useState<WorkspaceSavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshMethods = useCallback(async () => {
    const result = await listWorkspacePaymentMethods();
    if ('error' in result) {
      setError(result.error || '');
      setMethods([]);
    } else {
      setError('');
      setMethods(result.methods);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await listWorkspacePaymentMethods();
      if (!active) return;
      if ('error' in result) {
        setError(result.error || '');
        setMethods([]);
      } else setMethods(result.methods);
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const setupIntent = new URLSearchParams(window.location.search).get('setup_intent');
    if (!setupIntent) return;
    let active = true;
    setBusyId(setupIntent);
    setMessage('Verifying your Workspace payment method…');
    void saveWorkspaceCard(setupIntent)
      .then(async (result) => {
        if (!active) return;
        if (result.error) setError(result.error);
        else {
          setError('');
          setMessage('Workspace payment method saved.');
          await refreshMethods();
        }
        router.replace('/account', { scroll: false });
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to verify the saved payment method.');
      })
      .finally(() => {
        if (active) setBusyId('');
      });
    return () => {
      active = false;
    };
  }, [refreshMethods, router]);

  async function updateMethod(method: WorkspaceSavedPaymentMethod, action: 'default' | 'remove') {
    setBusyId(method.id);
    setError('');
    setMessage('');
    try {
      const result = action === 'default'
        ? await setWorkspaceDefaultPaymentMethod(method.id)
        : await removeWorkspacePaymentMethod(method.id);
      if (result.error) setError(result.error || '');
      else {
        setMessage(result.message || '');
        await refreshMethods();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update Workspace payment methods.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="stack">
      <p className="muted">Workspace-only cards are kept separate from homepage subscription payment methods.</p>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      {loading ? <p className="muted">Loading Workspace payment methods…</p> : null}
      {!loading && !methods.length && !error ? <p className="muted">No saved Workspace cards yet.</p> : null}
      {methods.map((method) => (
        <div key={method.id} className="setting-row">
          <div>
            <strong>{method.brand} ···· {method.last4}</strong>
            <p className="muted text-sm">
              {method.expMonth && method.expYear ? `Expires ${String(method.expMonth).padStart(2, '0')}/${method.expYear}` : 'Saved card'}
              {method.isDefault ? ' · Default for Workspace' : ''}
            </p>
          </div>
          <div className="button-row">
            {!method.isDefault ? (
              <button className="button secondary" type="button" disabled={Boolean(busyId)} onClick={() => void updateMethod(method, 'default')}>
                Set default
              </button>
            ) : null}
            <button className="button secondary" type="button" disabled={Boolean(busyId)} onClick={() => void updateMethod(method, 'remove')}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {publishableKey ? (
        <WorkspaceCreditCheckout mode="card" publishableKey={publishableKey} returnPath="/account" />
      ) : (
        <p className="notice error">Stripe publishable key is not configured.</p>
      )}
    </div>
  );
}
