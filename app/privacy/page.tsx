import { PolicyPage } from '@/components/policy-page';
export const metadata = {
  title: 'Privacy Policy',
  description: 'Read the One Fin Solution Privacy Policy to learn how account, support, and service information is handled.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    type: 'website',siteName: 'One Fin Solution',
    title: 'Privacy Policy', description: 'How One Fin Solution handles account, support, and service information.', url: '/privacy',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};
export default function Page() { return <PolicyPage kind="privacy" />; }
