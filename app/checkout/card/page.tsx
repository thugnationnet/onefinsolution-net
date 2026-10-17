import { redirect } from 'next/navigation';

/** Legacy card-setup route removed — direct credit purchase only. */
export default function CheckoutCardPage() {
  redirect('/checkout/credits');
}
