'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { resendConfirmationAction } from '@/app/auth-actions';
export default function EmailConfirmation() {
  const email=useSearchParams().get('email')||'';
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function resend(){setBusy(true);setError('');setNotice('');try{const result=await resendConfirmationAction(email);if(!result.success)setError(result.error||'Unable to request another email.');else setNotice('If this address is awaiting confirmation, a new link has been sent.');}catch{setError('Unable to request another email. Please try again.');}finally{setBusy(false);}}
  return <div className="auth-wrap"><p className="eyebrow">ONE MORE STEP</p><h1>Check your inbox.</h1><p>If this address can be registered, look for an email from One Fin at <strong className="break-all">{email||'the address you supplied'}</strong>. Open the confirmation link to finish creating your account.</p><p className="small-copy">Check spam and junk folders. Confirmation links expire after 24 hours.</p>{error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}<button className="button mt-6" disabled={busy||!email} onClick={resend}>{busy?'Requesting link…':'Resend confirmation email'}</button><div className="auth-links"><Link className="text-link" href="/sign-in">Back to sign in</Link><Link className="text-link" href="/contact?category=account">Get help</Link></div></div>;
}
