const production = process.env.NODE_ENV === 'production';

function isValidCookieDomain(value: string): boolean {
  return /^\.?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
}

function hostnameFromSiteUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return undefined;
    if (!isValidCookieDomain(host)) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

const configuredDomain = process.env.SESSION_COOKIE_DOMAIN?.trim();
if (
  production &&
  configuredDomain &&
  configuredDomain !== 'localhost' &&
  !isValidCookieDomain(configuredDomain)
) {
  throw new Error('SESSION_COOKIE_DOMAIN must be a valid DNS domain when set.');
}

// Prefer explicit SESSION_COOKIE_DOMAIN; otherwise derive from NEXT_PUBLIC_SITE_URL
// so production auth cookies bind to onefinsolution.net after the domain migration.
const domain =
  production && configuredDomain && configuredDomain !== 'localhost'
    ? configuredDomain
    : production
      ? hostnameFromSiteUrl()
      : undefined;

export const sessionCookie = production ? '__Secure-onefin-session' : 'onefin-session';
export const legacySessionCookie = production ? '__Host-onefin-session' : null;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    ...(domain ? { domain } : {}),
  };
}
