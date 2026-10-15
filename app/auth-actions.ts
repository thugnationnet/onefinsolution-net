'use server';
import { currentUser, destroySession } from '@/lib/session';
import { requestEmailToken, resetPassword, throttle } from '@/lib/auth-service';
import { query } from '@/lib/db';
import { cookies, headers } from 'next/headers';
import { encodedRedirect } from '@/utils/redirect';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sendAccountUpdatedEmail, emailConfigured } from '@/lib/email';
export async function authRequestThrottle() {
  const ip=(await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  await throttle(`auth-ip:${ip}`,50);
}
export async function forgotPasswordAction(form:FormData) {
  try { await authRequestThrottle(); await requestEmailToken(String(form.get('email')||''),'reset'); }
  catch(error) { return encodedRedirect('error','/forgot-password',error instanceof Error?error.message:'Unable to send reset email.'); }
  return encodedRedirect('success','/forgot-password','If an account exists, a reset link has been sent.');
}
export async function resendConfirmationAction(email:string) {
  try { await authRequestThrottle(); await requestEmailToken(email,'verify'); return {success:true}; }
  catch(error) { return {success:false,error:error instanceof Error?error.message:'Unable to send confirmation email.'}; }
}
export async function resetPasswordAction(form:FormData) {
  try {
    await authRequestThrottle();
    const password=String(form.get('password')||'');
    if(password!==form.get('confirmPassword')) throw new Error('Passwords must match.');
    const jar=await cookies();
    await resetPassword(jar.get('onefin-reset')?.value||'',password);
    jar.delete('onefin-reset');
    await destroySession();
  } catch(error) { return encodedRedirect('error','/reset-password',error instanceof Error?error.message:'Unable to reset password.'); }
  return encodedRedirect('success','/sign-in','Password updated. Please sign in again.');
}
export async function updateProfileAction(form:FormData) {
  const user=await currentUser(); if(!user) return encodedRedirect('error','/sign-in','Please sign in.');
  const name=String(form.get('name')||'').trim();
  if(name.length>120) return encodedRedirect('error','/account','Name is too long.');
  await query(`update app_users set name=$2,updated_at=now() where id=$1`,[user.id,name||null]);
  try {
    if (emailConfigured()) {
      await sendAccountUpdatedEmail(user.email, {
        toName: name || null,
        note: 'Your profile details were updated successfully.',
        actionUrl: '/account',
      });
    }
  } catch {
    /* Account update email is best-effort */
  }
  revalidatePath('/account');
  return encodedRedirect('success','/account','Profile saved.');
}
