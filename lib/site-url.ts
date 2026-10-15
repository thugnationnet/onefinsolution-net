export function siteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_SITE_URL is required in production.');
    return 'http://localhost:3000';
  }
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production') {
    if (url.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_SITE_URL must use https in production.');
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      throw new Error('NEXT_PUBLIC_SITE_URL must not be localhost in production.');
    }
  }
  return url.origin;
}

/** Absolute URL on the main site (for Stripe return_url and emails). */
export function sitePath(path: string): string {
  const base = siteUrl().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Browser-safe absolute URL using NEXT_PUBLIC_SITE_URL only. */
export function publicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function publicSitePath(path: string): string {
  const base = publicSiteUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
