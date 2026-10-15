'use client';

import { useState, useTransition } from 'react';
import { updateAccountPasswordAction } from '@/app/account-actions';

export function AccountPasswordForm() {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function submit(formData: FormData) {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await updateAccountPasswordAction(formData);
      if ('error' in result && result.error) setError(result.error);
      else setMessage(result.message || 'Password updated. Sign in again with your new password.');
    });
  }

  return (
    <form action={submit} className="stack">
      <label className="field">
        <span>Current password</span>
        <input name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>New password</span>
        <input name="nextPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Updating password…' : 'Change password'}</button>
      <p className="muted">For security, updating your password signs out other sessions.</p>
    </form>
  );
}
