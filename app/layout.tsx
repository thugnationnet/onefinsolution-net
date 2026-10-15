import type { Metadata } from "next";
import "./globals.css";
import "./footer-social.css";
import { Inter } from "next/font/google";
import { ClientLayout } from "./client";
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import { company } from '@/lib/company';

const inter = Inter({ subsets: ["latin"] });
// Authenticated pages read cookies; do not prerender against external services at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(company.website),
  title: {
    default: 'One Fin Solution | AI Chat and Software Workspace',
    template: '%s | One Fin Solution',
  },
  description: 'Explore One Fin Solution for AI-powered conversations, useful software tools, and a dedicated Workspace.',
  applicationName: 'One Fin Solution',
  category: 'technology',
  icons: {
    icon: [{ url: '/logo/one-fin-logo.png', type: 'image/png', sizes: '1254x1254' }],
    shortcut: ['/logo/one-fin-logo.png'],
    apple: [{ url: '/logo/one-fin-logo.png', sizes: '1254x1254', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'One Fin Solution',
    title: 'One Fin Solution | AI Chat and Software Workspace',
    description: 'Explore AI-powered conversations and practical software tools from One Fin Solution.',
    images: [
      { url: '/images/iages4.jpg', width: 2000, height: 1094, alt: 'Artificial intelligence network visual' },
      { url: '/logo/one-fin-logo.png', width: 1254, height: 1254, alt: 'One Fin Solution logo' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One Fin Solution | AI Chat and Software Workspace',
    description: 'Explore AI-powered conversations and practical software tools from One Fin Solution.',
    images: ['/images/iages4.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                '@id': `${company.website}/#organization`,
                name: 'One Fin Solution',
                legalName: company.name,
                url: company.website,
                logo: `${company.website}/logo/one-fin-logo.png`,
              },
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                '@id': `${company.website}/#website`,
                name: 'One Fin Solution',
                url: company.website,
                publisher: { '@id': `${company.website}/#organization` },
                inLanguage: 'en',
              },
            ]).replace(/</g, '\\u003c'),
          }}
        />
        <Suspense fallback={<p className="p-6">Loading…</p>}><ClientLayout>{children}</ClientLayout></Suspense>
        <Toaster richColors />
      </body>
    </html>
  );
}
