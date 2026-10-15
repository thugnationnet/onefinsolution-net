import { NextRequest, NextResponse } from 'next/server';
import { authRedirect } from '@/lib/auth-redirect';
import { legacySessionCookie, sessionCookie, sessionCookieOptions } from '@/lib/session-cookie';

export function middleware(request: NextRequest) {
  const token = request.cookies.get(sessionCookie)?.value;
  const legacyToken = legacySessionCookie ? request.cookies.get(legacySessionCookie)?.value : undefined;
  const present = Boolean(token || legacyToken);
  // Redirect authenticated visitors only after server-side session verification, not on cookie presence.
  const destination = present ? null : authRedirect(request.nextUrl.pathname, false);
  const response = destination ? NextResponse.redirect(new URL(destination, request.url)) : NextResponse.next();
  if (!token && legacyToken) response.cookies.set(sessionCookie, legacyToken, sessionCookieOptions(30 * 86400));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
