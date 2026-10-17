import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { SubscriptionCheckoutReturn } from '@/components/subscription-checkout-return';

export default async function CheckoutReturn({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  if (!await currentUser()) redirect('/sign-in');
  return <div className="page-wrap"><h1>Subscription billing</h1><SubscriptionCheckoutReturn sessionId={session_id || ''} /></div>;
}
