import { PolicyPage } from '@/components/policy-page';
export const metadata = {
  title: 'Payment, Cancellation and Refund Policy',
  description: 'Review One Fin Solution payment, subscription cancellation, Workspace credit, and refund terms.',
  alternates: { canonical: '/payment-policy' },
  openGraph: {
    type: 'website',siteName: 'One Fin Solution',
    title: 'Payment, Cancellation and Refund Policy', description: 'Payment, subscription cancellation, Workspace credit, and refund terms.', url: '/payment-policy',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};
export default function Page() { return <PolicyPage kind="payment-policy" />; }
