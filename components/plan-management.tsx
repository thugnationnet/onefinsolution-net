'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelSubscriptionAction,reactivateSubscriptionAction } from '@/app/actions';
export function PlanManagement({id,cancelled}:{id:string;cancelled:boolean}) {
  const [busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const router=useRouter();
  async function act() {setBusy(true);setError('');setNotice('');try {const result=await (cancelled?reactivateSubscriptionAction:cancelSubscriptionAction)(id);if(!result.success) setError(result.error||'Unable to update this plan.');else {setNotice(cancelled?'Renewal reactivated.':'Cancellation scheduled for the end of the paid period.');setConfirm(false);router.refresh();}}catch{setError('Unable to update this plan. Please contact support.');}finally{setBusy(false);}}
  return <div>{notice&&<p className="notice success" role="status">{notice}</p>}{error&&<p className="notice error" role="alert">{error}</p>}{confirm?<div className="notice"><p>{cancelled?'Turn automatic renewal back on?':'Cancel the next renewal? Your paid access remains until the current period ends.'}</p><div className="button-row"><button className="button small" onClick={act} disabled={busy}>{busy?'Updating…':'Confirm'}</button><button className="button secondary small" onClick={()=>setConfirm(false)} disabled={busy}>Go back</button></div></div>:<button className="button secondary small mt-4" onClick={()=>setConfirm(true)}>{cancelled?'Reactivate renewal':'Cancel renewal'}</button>}</div>;
}
