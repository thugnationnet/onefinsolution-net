'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

const navigationLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/support', label: 'Help center' },
  { href: '/contact', label: 'Contact' },
];

const socialLinks = [
  {
    href: 'https://www.facebook.com/onefinsolution',
    label: 'Facebook',
    path: 'M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3.1l.9-3H13V9c0-.6.4-1 1-1z',
  },
  {
    href: 'https://www.instagram.com/onefinsolution/',
    label: 'Instagram',
    path: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7zm11.2 1.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM12 8.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2zm0 2a1.8 1.8 0 1 0 1.8 1.8A1.8 1.8 0 0 0 12 10.2z',
  },
  {
    href: 'https://www.tiktok.com/@onefinsolution',
    label: 'TikTok',
    path: 'M14.5 3c.4 2.1 1.7 3.7 3.8 4.1v2.3c-1.3-.1-2.5-.5-3.5-1.2v5.6c0 3.1-2.5 5.6-5.6 5.6S3.6 16.9 3.6 13.8 6.1 8.2 9.2 8.2c.3 0 .6 0 .9.1v2.4c-.3-.1-.6-.1-.9-.1-1.8 0-3.2 1.5-3.2 3.2s1.4 3.2 3.2 3.2 3.2-1.4 3.2-3.2V3h2.1z',
  },
  {
    href: 'https://wa.me/66959193513',
    label: 'WhatsApp',
    path: 'M12.04 3C7.08 3 3.05 6.95 3.05 11.9c0 1.57.42 3.1 1.22 4.45L3 21l4.8-1.24a9 9 0 0 0 4.24 1.06h.01c4.96 0 8.99-3.95 8.99-8.9S17 3 12.04 3zm5.22 12.66c-.22.62-1.28 1.18-1.78 1.26-.46.07-1.04.1-1.68-.1-.39-.13-.89-.3-1.53-.59-2.69-1.16-4.43-3.87-4.56-4.05-.13-.17-1.07-1.42-1.07-2.71 0-1.29.68-1.93.92-2.19.24-.26.52-.33.7-.33h.5c.16 0 .37-.06.58.44.22.52.74 1.8.8 1.93.07.13.11.28.02.45-.09.17-.13.28-.26.43-.13.15-.27.33-.39.44-.13.13-.26.27-.11.52.15.26.66 1.09 1.42 1.76 1 1.1 1.8 1.45 2.06 1.61.26.15.41.13.56-.08.15-.2.65-.76.82-1.02.17-.26.35-.22.58-.13.24.09 1.5.71 1.76.84.26.13.43.2.49.31.07.11.07.65-.15 1.27z',
  },
  {
    href: 'https://maps.app.goo.gl/yrcH4bzMHeVfnDdy7',
    label: 'Google Maps',
    path: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z',
  },
] as const;

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="site-header">
      <Link className="site-brand" href="/" onClick={closeMenu} aria-label="One Fin Solution home">
        <span className="brand-mark" aria-hidden="true">
          <Image src="/logo/one-fin-logo.png" alt="" width={44} height={44} priority />
        </span>
        <span>
          One Fin <span className="site-brand-light">Solution</span>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label="Main navigation">
        {navigationLinks.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={isCurrentPath(pathname, href) ? 'page' : undefined}>
            {label}
          </Link>
        ))}
        <Link href="/software/" aria-current={isCurrentPath(pathname, '/software') ? 'page' : undefined}>
          Software
        </Link>
      </nav>

      <div className="header-actions">
        {!isLoading &&
          (isAuthenticated ? (
            <Link className="button small secondary header-account-link" href="/dashboard">
              Dashboard
            </Link>
          ) : (
            <Link className="header-sign-in" href="/sign-in">
              Sign in
            </Link>
          ))}
        <Link className="button small" href="/workspace">
          Workspace
        </Link>
        <button
          className="mobile-toggle"
          type="button"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-site-navigation"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className={`menu-glyph${isMenuOpen ? ' is-open' : ''}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {isMenuOpen && (
        <nav className="mobile-nav" id="mobile-site-navigation" aria-label="Mobile navigation">
          {navigationLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrentPath(pathname, href) ? 'page' : undefined}
              onClick={closeMenu}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/software/"
            aria-current={isCurrentPath(pathname, '/software') ? 'page' : undefined}
            onClick={closeMenu}
          >
            Software
          </Link>
          {!isLoading &&
            (isAuthenticated ? (
              <Link href="/dashboard" onClick={closeMenu}>
                Dashboard
              </Link>
            ) : (
              <Link href="/sign-in" onClick={closeMenu}>
                Sign in
              </Link>
            ))}
          <Link href="/workspace" onClick={closeMenu}>
            Workspace
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link className="site-brand footer-brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <Image src="/logo/one-fin-logo.png" alt="" width={52} height={52} />
            </span>
            <span>
              One Fin <span className="site-brand-light">Solution</span>
            </span>
          </Link>
          <p>Practical software and AI tools for the work ahead.</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <div>
            <strong>Explore</strong>
            <Link href="/">Homepage chat</Link>
            <Link href="/pricing">Plans &amp; pricing</Link>
            <Link href="/support">Help center</Link>
            <Link href="/software/">Software</Link>
          </div>
          <div>
            <strong>Company</strong>
            <Link href="/about">About us</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/dashboard">My dashboard</Link>
          </div>
          <div>
            <strong>Policies</strong>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms &amp; conditions</Link>
            <Link href="/payment-policy">Payments &amp; refunds</Link>
          </div>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} One Fin Solution. All rights reserved.</span>
        <div className="footer-social" aria-label="Social media">
          {socialLinks.map(({ href, label, path }) => (
            <a
              key={label}
              className="footer-social-link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d={path} />
              </svg>
            </a>
          ))}
        </div>
        <Link href="/contact">Get in touch</Link>
      </div>
    </footer>
  );
}
