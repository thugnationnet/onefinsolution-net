import Link from 'next/link';
import { PageHeading } from '@/components/page-heading';
import { HelpCenter } from '@/components/help-center';
export const metadata = {
  title: 'Help Center and Support',
  description: 'Find help with One Fin Solution accounts, passwords, chat plans, Workspace credits, and product support.',
  alternates: { canonical: '/support' },
  openGraph: {
    type: 'website',
    siteName: 'One Fin Solution',
    title: 'One Fin Solution Help Center',
    description: 'Find answers about accounts, chat plans, Workspace credits, and product support.',
    url: '/support',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};
export default function Support() { return <div className="page-wrap"><PageHeading eyebrow="SUPPORT / HELP CENTER" title="A little help goes a long way." description="Practical answers for your account, workspace, and plans. Find what you need and get back to your work." /><HelpCenter /><section className="callout section-space"><div><h2>Still need a hand?</h2><p>Tell us what happened. Include the error message, but keep passwords and payment details private.</p></div><Link className="button" href="/contact">Submit a request</Link></section><div className="button-row"><Link className="text-link" href="/dashboard/support">View my support requests</Link><Link className="text-link" href="/forgot-password">Recover my account</Link></div></div>; }
