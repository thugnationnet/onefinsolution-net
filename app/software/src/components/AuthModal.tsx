import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, X } from 'lucide-react';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset';
export interface AuthUser { id: string; email: string }

const copy: Record<AuthMode, { title: string; description: string; submit: string }> = {
  'sign-in': { title: 'Welcome back', description: 'Sign in to your One Fin Software account.', submit: 'Sign in' },
  'sign-up': { title: 'Create your account', description: 'Set up an account for this software store.', submit: 'Create account' },
  'forgot-password': { title: 'Reset your password', description: 'We’ll send a password reset link if an account exists for that email.', submit: 'Send reset link' },
  reset: { title: 'Choose a new password', description: 'Use a new password to regain access to your account.', submit: 'Update password' },
};

export function AuthModal({
  mode,
  onModeChange,
  onClose,
  onAuthenticated,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetToken, setResetToken] = useState('');
  const activeCopy = copy[mode];

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('reset');
    if (mode === 'reset' && token) setResetToken(token);
  }, [mode]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleKey);
    document.body.classList.add('auth-modal-open');
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.classList.remove('auth-modal-open');
    };
  }, [busy, onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'sign-up' && !acceptTerms) {
      setError('Please agree to the Terms & Conditions and Privacy Policy.');
      return;
    }
    if (mode === 'reset' && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    const endpoint = {
      'sign-in': '/api/auth/sign-in',
      'sign-up': '/api/auth/sign-up',
      'forgot-password': '/api/auth/forgot-password',
      reset: '/api/auth/reset-password',
    }[mode];
    const payload = mode === 'forgot-password'
      ? { email }
      : mode === 'reset'
        ? { token: resetToken, password }
        : { email, password, acceptTerms };

    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; user?: AuthUser; message?: string };
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');

      if (data.user) onAuthenticated(data.user);
      else if (mode === 'forgot-password') setNotice(data.message || 'If an account exists for this address, password reset instructions have been sent.');
      else {
        setNotice('Your password has been updated. Sign in with your new password.');
        window.history.replaceState(null, '', window.location.pathname);
        setResetToken('');
        setPassword('');
        setConfirmPassword('');
        onModeChange('sign-in');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={19} /></button>
        <div className="auth-brand-mark"><img src="/images/one-fin-logo.png" alt="" width="42" height="42" /></div>
        <p className="auth-eyebrow">ONE FIN SOFTWARE</p>
        <h2 id="auth-title">{activeCopy.title}</h2>
        <p className="auth-description">{activeCopy.description}</p>
        {error && <p className="auth-message is-error" role="alert">{error}</p>}
        {notice && <p className="auth-message is-success" role="status">{notice}</p>}
        <form onSubmit={submit}>
          {mode !== 'reset' && <label>Email address<input autoComplete="email" type="email" name="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          {(mode === 'sign-in' || mode === 'sign-up' || mode === 'reset') && <label>{mode === 'reset' ? 'New password' : 'Password'}<input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} type="password" name="password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use 12–128 characters.</small></label>}
          {mode === 'reset' && <label>Confirm new password<input autoComplete="new-password" type="password" name="confirmPassword" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}
          {mode === 'sign-up' && <label className="auth-terms"><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} /> <span>I agree to the <a href={`${import.meta.env.VITE_MAIN_SITE_URL || window.location.origin}/terms`} target="_blank" rel="noreferrer">Terms &amp; Conditions</a> and <a href={`${import.meta.env.VITE_MAIN_SITE_URL || window.location.origin}/privacy`} target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>}
          {mode === 'reset' && !resetToken && <p className="auth-message is-error" role="alert">This reset link is missing or invalid. Request a new password reset link.</p>}
          <button className="auth-submit" type="submit" disabled={busy || (mode === 'reset' && !resetToken)}>
            {busy ? <><LoaderCircle className="auth-spinner" size={17} /> Please wait…</> : activeCopy.submit}
          </button>
        </form>
        <div className="auth-switches">
          {mode === 'sign-in' && <><button type="button" onClick={() => { setError(''); setNotice(''); onModeChange('forgot-password'); }}>Forgot password?</button><p>New to One Fin Software? <button type="button" onClick={() => { setError(''); setNotice(''); onModeChange('sign-up'); }}>Create an account</button></p></>}
          {mode === 'sign-up' && <p>Already have an account? <button type="button" onClick={() => { setError(''); setNotice(''); onModeChange('sign-in'); }}>Sign in</button></p>}
          {(mode === 'forgot-password' || mode === 'reset') && <button className="auth-back" type="button" onClick={() => { setError(''); setNotice(''); onModeChange('sign-in'); }}><ArrowLeft size={14} /> Back to sign in</button>}
        </div>
      </section>
    </div>
  );
}
