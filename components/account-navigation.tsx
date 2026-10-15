'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/account', label: 'Workspace setup', exact: true },
  { href: '/account/preferences', label: 'Workspace preferences' },
  { href: '/account/plugins', label: 'Workspace tools' },
  { href: '/account/privacy', label: 'Privacy & data' },
  { href: '/workspace', label: 'Open Workspace' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/billing', label: 'Plans & billing' },
];

export function AccountNavigation() {
  const pathname = usePathname();

  return (
    <nav className="account-nav" aria-label="Workspace setup">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? 'account-nav-link active' : 'account-nav-link'}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
