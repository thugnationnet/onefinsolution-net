import type { Metadata } from 'next';
import Storefront from './src/App';
import './src/index.css';

export const metadata: Metadata = {
  title: 'Software & Templates',
  description: 'Explore website templates, software starting points, and custom development services from One Fin Solution.',
  alternates: { canonical: '/software' },
  openGraph: {
    type: 'website',
    siteName: 'One Fin Solution',
    title: 'Software & Templates | One Fin Solution',
    description: 'Explore website templates, software starting points, and custom development services.',
    url: '/software',
  },
};

export default function SoftwarePage() {
  return <Storefront />;
}
