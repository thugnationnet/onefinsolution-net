import Link from 'next/link';
import { Layers, Globe2, ShieldCheck } from 'lucide-react';
import { PageHeading } from '@/components/page-heading';
import { company } from '@/lib/company';

export const metadata = {
  title: 'About One Fin Solution',
  description: 'Learn about One Fin Solution, the company behind practical software, AI conversations, and online workspace tools.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'website',
    siteName: 'One Fin Solution',
    title: 'About One Fin Solution',
    description: 'Learn about the company behind practical software and AI workspace tools.',
    url: '/about',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
};

const principles = [
  { icon: Layers, title: 'A connected workspace', body: 'Conversations and reusable context in one account.' },
  { icon: ShieldCheck, title: 'Control over your account', body: 'Profile preferences, password controls, and session management.' },
  { icon: Globe2, title: 'An international outlook', body: 'Clear product information and online support wherever you work.' },
];

export default function About() {
  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="ABOUT ONE FIN"
        title="Software with a practical purpose."
        description="We bring software access, AI conversations, and useful workspace tools together so people can spend more time on the work that matters."
      />
      <div className="two-grid">
        <section className="panel">
          <h2>Who we are</h2>
          <p>{company.name} is the company behind One Fin Solution. Our registered business activity is maintaining rights to reproduce finished software for sale or distribution.</p>
          <p>Our website gives users a place to manage their account, organize conversations and reference material, and explore software plans. We serve an international audience, with product and payment availability depending on location.</p>
        </section>
        <section className="hero-preview">
          <p className="eyebrow">OUR APPROACH</p>
          <h2>Useful tools.<br />Clear choices.<br />A human point of contact.</h2>
          <p className="mt-6">We believe the basics should be easy: finding a plan, understanding your account, and knowing where to ask for help.</p>
        </section>
      </div>
      <section className="three-grid section-space" aria-label="Our principles">
        {principles.map(({ icon: Icon, title, body }) => (
          <article key={title} className="panel">
            <Icon className="feature-icon" aria-hidden="true" />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="callout">
        <div>
          <h2>Company information</h2>
          <p>{company.name}<br />Registration number: {company.registrationNumber}</p>
        </div>
        <Link href="/contact" className="button">Contact our team</Link>
      </section>
    </div>
  );
}
