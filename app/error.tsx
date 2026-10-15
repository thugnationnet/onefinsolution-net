'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}) { return <div className="page-wrap"><p className="eyebrow">PLEASE TRY AGAIN</p><h1>Something went wrong.</h1><p className="hero-copy">We could not load this page. Try again in a moment. If the problem continues, our support team can help.</p><div className="button-row"><button className="button" onClick={reset}>Try again</button><Link className="button secondary" href="/">Return home</Link><Link className="text-link" href="/contact?category=technical">Contact support</Link></div></div>; }
