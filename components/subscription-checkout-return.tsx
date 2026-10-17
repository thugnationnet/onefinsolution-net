'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { finishSubscription } from '@/app/subscription-actions';

export function SubscriptionCheckoutReturn({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState('Confirming your checkout…');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    void finishSubscription(sessionId).then(result => {
      if (stopped) return;
      if (result.error) { setError(result.error); setStatus(''); }
      else setStatus(result.data?.status === 'complete'
        ? 'Checkout confirmed. Your subscription billing details are up to date.'
        : 'Your checkout is still pending. Check again after completing Stripe Checkout.');
    }).catch(() => { if (!stopped) { setError('Unable to confirm checkout. Please try again.'); setStatus(''); } });
    return () => { stopped = true; };
  }, [sessionId, attempt]);
  return <div className="stack">
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
    <div className="button-row"><Link className="button" href="/dashboard/billing">Plan & billing</Link><Link className="button secondary" href="/">Return to home</Link>
    <button className="button secondary" onClick={() => { setError(''); setAttempt(n => n + 1); }}>Check again</button></div>
  </div>;
}
