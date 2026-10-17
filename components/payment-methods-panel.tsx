'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  detachPaymentMethodAction,
  listPaymentMethodsAction,
  setDefaultPaymentMethodAction,
  type SavedPaymentMethod,
} from '@/app/payment-method-actions';
import { Button } from '@/components/ui/button';

export function PaymentMethodsPanel() {
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError('');
      const result = await listPaymentMethodsAction();
      if ('error' in result) {
        setError(result.error);
        setMethods([]);
        return;
      }
      setMethods(result.methods);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="stack gap-md">
      <div>
        <h3 className="text-base font-semibold">Saved payment methods</h3>
        <p className="muted text-sm">
          Cards appear here after a successful subscription payment. There is no separate card-setup step.
        </p>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {methods.length === 0 ? (
        <p className="muted text-sm">No cards on file yet. Complete a subscription payment to save a card for renewals.</p>
      ) : (
        <ul className="stack gap-sm">
          {methods.map((method) => (
            <li key={method.id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>
                  {method.brand} •••• {method.last4}
                </strong>
                {method.isDefault ? <span className="muted"> (default)</span> : null}
                {method.expMonth && method.expYear ? (
                  <div className="muted text-sm">
                    Exp {method.expMonth}/{method.expYear}
                  </div>
                ) : null}
              </div>
              <div className="row gap-sm">
                {!method.isDefault ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        setError('');
                        setNotice('');
                        const result = await setDefaultPaymentMethodAction(method.id);
                        if (result && 'error' in result && result.error) setError(result.error);
                        else {
                          setNotice('Default card updated.');
                          refresh();
                        }
                      });
                    }}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      setError('');
                      setNotice('');
                      const result = await detachPaymentMethodAction(method.id);
                      if (result && 'error' in result && result.error) setError(result.error);
                      else {
                        setNotice('Card removed.');
                        refresh();
                      }
                    });
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
