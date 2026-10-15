'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const MESSAGES: Record<string, { tone: 'success' | 'error' | 'info'; text: string }> = {
  success: { tone: 'success', text: 'Payment completed successfully. Your account is up to date.' },
  failed: { tone: 'error', text: 'Payment did not complete. No charge was finalized. You can try again when ready.' },
  cancelled: { tone: 'info', text: 'Checkout was cancelled. Your plan and credits were not changed.' },
  action_required: {
    tone: 'info',
    text: 'Additional payment confirmation is required. Open Plans & billing to finish the payment.',
  },
  card_saved: { tone: 'success', text: 'Payment card saved for Workspace purchases.' },
};

export function BillingStatusBanner({ param = 'billing' }: { param?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get(param);
  const purchase = params.get('purchase');
  const message = useMemo(() => {
    if (!status) return null;
    if (status === 'success' && purchase) {
      return {
        tone: 'success' as const,
        text: 'Workspace credit purchase completed. Your balance will refresh shortly if it has not already.',
      };
    }
    return MESSAGES[status] || null;
  }, [status, purchase]);
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
  }, [message]);

  useEffect(() => {
    if (!status && !purchase) return;
    const next = new URLSearchParams(params.toString());
    next.delete(param);
    // keep purchase id briefly for fulfillment polling; drop billing flag after show
    const query = next.toString();
    const timer = window.setTimeout(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [status, purchase, param, params, pathname, router]);

  if (!visible || !message) return null;

  const className =
    message.tone === 'error' ? 'notice error' : message.tone === 'success' ? 'notice success' : 'notice';

  return (
    <p className={className} role={message.tone === 'error' ? 'alert' : 'status'}>
      {message.text}
    </p>
  );
}
