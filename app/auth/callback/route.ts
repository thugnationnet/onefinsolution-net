import { NextRequest, NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site-url';
import { consumeVerification } from '@/lib/auth-service';
import { createSession } from '@/lib/session';
export async function GET(request:NextRequest) {
  const token=request.nextUrl.searchParams.get('token')||'';
  const purpose=request.nextUrl.searchParams.get('purpose');
  if(purpose==='reset' && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const response=NextResponse.redirect(new URL('/reset-password',siteUrl()));
    response.cookies.set('onefin-reset',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:1800});
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  }
  try {
    if(purpose!=='verify') throw new Error('Invalid link.');
    const id=await consumeVerification(token);
    await createSession(id);
    return NextResponse.redirect(new URL('/account',siteUrl()));
  } catch { return NextResponse.redirect(new URL('/sign-in?error=Authentication%20link%20is%20invalid%20or%20expired.',siteUrl())); }
}
