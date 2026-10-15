import { PolicyPage } from '@/components/policy-page';
export const metadata = {
  title: 'Terms and Conditions',
  description: 'Review the terms and conditions for using One Fin Solution websites, software, subscriptions, and Workspace services.',
  alternates: { canonical: '/terms' },
  openGraph: {
    type: 'website',siteName: 'One Fin Solution',
    title: 'Terms and Conditions', description: 'Terms for One Fin Solution websites, software, subscriptions, and Workspace services.', url: '/terms',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};
export default function Page() { return <PolicyPage kind="terms" />; }
