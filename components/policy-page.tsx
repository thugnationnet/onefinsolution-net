import Link from 'next/link';
import { PageHeading } from './page-heading';
import { policies } from '@/lib/site-content';
export function PolicyPage({ kind }: { kind: keyof typeof policies }) {
  const policy = policies[kind];
  return <div className="page-wrap"><PageHeading eyebrow="LEGAL & TRUST · UPDATED OCTOBER 10, 2026" title={policy.title} description={policy.description} /><div className="legal-layout"><nav className="legal-toc" aria-label="On this page"><strong>On this page</strong>{policy.sections.map((section,index) => <a key={section.title} href={`#section-${index+1}`}>{section.title}</a>)}</nav><article className="legal-copy">{policy.sections.map((section,index) => <section key={section.title} id={`section-${index+1}`}><h2>{index+1}. {section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}<div className="notice">Need help with this policy? <Link className="text-link" href="/contact">Contact One Fin</Link>.</div></article></div></div>;
}
