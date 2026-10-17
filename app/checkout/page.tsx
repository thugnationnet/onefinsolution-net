import { redirect } from 'next/navigation';

/** Legacy /checkout → Workspace credits checkout (card setup: /checkout/card). */
export default function CheckoutIndexPage() {
  redirect('/checkout/credits');
}
