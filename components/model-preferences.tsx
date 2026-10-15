'use client';
import { useState } from 'react';
import { availableModels } from '@/lib/models';
import { updateUserModelSettings } from '@/app/actions';
export function ModelPreferences({enabled}:{enabled:string[]}) {
  const [selected,setSelected]=useState(enabled),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function save() { setBusy(true);setNotice('');setError('');try { const result=await updateUserModelSettings(selected);if(!result.success) setError(result.error||'Unable to save models.');else setNotice('Model preferences saved.'); } catch {setError('Unable to save models. Please try again.');}finally {setBusy(false);} }
  return <section className="panel"><h2>AI model preferences</h2><p>Choose which configured models appear in your chat selector. Provider availability depends on the service configuration.</p>{availableModels.map(model=><label className="setting-row" key={model.id}><span>{model.displayName}</span><input type="checkbox" checked={selected.includes(model.id)} onChange={event=>setSelected(event.target.checked?[...selected,model.id]:selected.filter(id=>id!==model.id))} /></label>)}{notice&&<p className="notice success" role="status">{notice}</p>}{error&&<p className="notice error" role="alert">{error}</p>}<button className="button mt-5" disabled={busy||!selected.length} onClick={save}>{busy?'Saving…':'Save model preferences'}</button></section>;
}
