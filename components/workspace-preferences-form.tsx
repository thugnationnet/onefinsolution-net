'use client';

import { useState, type FormEvent } from 'react';
import { saveWorkspacePreferencesAction } from '@/app/account-actions';
import type { AccountPreferences } from '@/lib/account-preferences';

export function WorkspacePreferencesForm({ settings }: { settings: AccountPreferences }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await saveWorkspacePreferencesAction(new FormData(event.currentTarget));
      if (result.error) setError(result.error || '');
      else setMessage(result.message || '');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save Workspace preferences.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="form-grid">
        <label className="field">
          <span>Theme</span>
          <select name="theme" defaultValue={settings.theme}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          <span>Time zone</span>
          <input name="timezone" defaultValue={settings.timezone} placeholder="Asia/Bangkok" />
        </label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="enter_to_send" defaultChecked={settings.enter_to_send} />
        Press Enter to send messages
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="spellcheck" defaultChecked={settings.spellcheck} />
        Enable spellcheck
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="context_enabled" defaultChecked={settings.context_enabled} />
        Keep conversation context enabled
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="product_updates" defaultChecked={settings.product_updates} />
        Product update emails
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <div>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save Workspace preferences'}
        </button>
      </div>
    </form>
  );
}
