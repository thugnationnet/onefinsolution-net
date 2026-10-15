import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confirm Your Email',
  robots: { index: false, follow: false },
};

export default function ConfirmationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
