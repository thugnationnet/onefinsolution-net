import { resetPasswordAction } from '@/app/auth-actions';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { tokenHash } from '@/lib/password';
import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { FormNotice } from '@/components/form-notice';
export const metadata={title:'Reset Password',robots:{index:false,follow:false}};
export default async function ResetPassword({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const params=await searchParams,token=(await cookies()).get('onefin-reset')?.value;
  const valid=token && /^[A-Za-z0-9_-]{43}$/.test(token) && (await query("select 1 from auth_tokens where token_hash=$1 and purpose='reset' and expires_at>now()",[tokenHash(token)])).length>0;
  return <div className="auth-wrap"><p className="eyebrow">ACCOUNT RECOVERY</p><h1>{valid?'Choose a new password.':'Request a fresh reset link.'}</h1><FormNotice {...params} />{valid?<><p>Use 12–128 characters. Updating your password signs out all existing sessions.</p><form action={resetPasswordAction} className="stack"><label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><SubmitButton pendingText="Updating password…">Update password</SubmitButton></form></>:<><p>Your password reset link is missing, expired, or already used. Request another link to safely recover your account.</p><Link className="button mt-6" href="/forgot-password">Request a new link</Link></>}<div className="auth-links"><Link className="text-link" href="/sign-in">Back to sign in</Link><Link className="text-link" href="/support">Help center</Link></div></div>;
}
