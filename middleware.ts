import { NextRequest, NextResponse } from 'next/server';
import { authRedirect } from '@/lib/auth-redirect';
import { legacySessionCookie, sessionCookie, sessionCookieOptions } from '@/lib/session-cookie';

const CANONICAL_HOST = 'onefinsolution.net';
const LEGACY_HOSTS = new Set(['onefinsolution.online', 'www.onefinsolution.online', 'www.onefinsolution.net']);

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  // HSTS only when request is HTTPS (Railway terminates TLS)
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  return response;
}

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const { pathname } = request.nextUrl;

  // Keep Stripe webhooks and health checks reachable on every attached domain.
  const skipCanonical =
    pathname.startsWith('/api/stripe/webhook') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/internal/');

  // Canonicalize browser traffic to the primary .net domain so session cookies match.
  if (!skipCanonical && LEGACY_HOSTS.has(host) && host !== CANONICAL_HOST) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    const redirect = NextResponse.redirect(url, 308);
    return applySecurityHeaders(redirect);
  }

  const token = request.cookies.get(sessionCookie)?.value;
  const legacyToken = legacySessionCookie
    ? request.cookies.get(legacySessionCookie)?.value
    : undefined;
  const present = Boolean(token || legacyToken);
  // Redirect authenticated visitors only after server-side session verification, not on cookie presence.
  const destination = present ? null : authRedirect(pathname, false);
  const response = destination
    ? NextResponse.redirect(new URL(destination, request.url))
    : NextResponse.next();

  if (!token && legacyToken) {
    response.cookies.set(sessionCookie, legacyToken, sessionCookieOptions(30 * 86400));
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
