'use client';
import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { savePreferencesAction } from '@/app/account-actions';
import type { AccountPreferences } from '@/lib/account-preferences';
import { SubmitButton } from './submit-button';
export function PreferencesForm({settings}:{settings:AccountPreferences}) {
  const {setTheme}=useTheme();
  useEffect(()=>{setTheme(settings.theme);},[settings.theme,setTheme]);
  const timezones=Intl.supportedValuesOf('timeZone');
  return <form action={savePreferencesAction} className="stack"><section className="panel"><h2>Workspace preferences</h2><p>These preferences are saved to your account.</p><div className="form-grid mt-6"><label className="field">Appearance<select aria-label="Appearance" name="theme" defaultValue={settings.theme}><option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label className="field">Time zone<select aria-label="Time zone" name="timezone" defaultValue={settings.timezone}>{[...new Set([settings.timezone,'UTC',...timezones])].map(zone=><option key={zone} value={zone}>{zone}</option>)}</select><small>Used for account activity and dates.</small></label></div></section><section className="panel"><h2>Extensions & chat tools</h2><p>Built-in tools that make your workspace easier to use.</p>{[
    ['enter_to_send','Enter to send','Send a chat message with Enter. Shift + Enter always adds a new line.'],
    ['spellcheck','Browser spellcheck','Let your browser highlight spelling suggestions in the message editor.'],
    ['context_enabled','Saved-context attachment','Show the context attachment tool when you start a new chat.'],
  ].map(([key,title,description])=><label className="setting-row" key={key}><span><strong>{title}</strong><p>{description}</p></span><input name={key} type="checkbox" defaultChecked={Boolean(settings[key as keyof AccountPreferences])} /></label>)}</section><section className="panel"><h2>Email preferences</h2><label className="setting-row"><span><strong>Product updates</strong><p>Allow optional One Fin product news. Account and security messages remain necessary for your account.</p></span><input name="product_updates" type="checkbox" defaultChecked={settings.product_updates} /></label></section><div><SubmitButton>Save preferences</SubmitButton></div></form>;
}
