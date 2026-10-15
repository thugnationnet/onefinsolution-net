"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkoutStatusAction } from '@/app/billing-actions';

export function CheckoutSuccessHandler() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await checkoutStatusAction(sessionId);
        if (cancelled) return;
        if (result === 'paid') {
          router.replace('/dashboard/billing?billing=success');
          return;
        }
        if (result === 'pending') {
          router.replace('/dashboard/billing?billing=action_required');
          return;
        }
        router.replace('/pricing?billing=failed');
      } catch {
        if (!cancelled) router.replace('/pricing?billing=failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return null;
}
