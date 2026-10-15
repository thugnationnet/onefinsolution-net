export const defaultPreferences = { theme:'system', timezone:'Asia/Bangkok', enter_to_send:true, spellcheck:true, context_enabled:true, product_updates:false };
export type AccountPreferences = typeof defaultPreferences;
export function parsePreferences(form: FormData): AccountPreferences {
  const theme=String(form.get('theme') || 'system');
  const timezone=String(form.get('timezone') || 'Asia/Bangkok');
  if (!['system','light','dark'].includes(theme)) throw new Error('Choose a supported appearance.');
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch { throw new Error('Choose a valid time zone.'); }
  return { theme, timezone, enter_to_send:form.get('enter_to_send')==='on', spellcheck:form.get('spellcheck')==='on', context_enabled:form.get('context_enabled')==='on', product_updates:form.get('product_updates')==='on' };
}
