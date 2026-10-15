import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { ownedQuery } from '@/lib/db';
import { readPreferences } from '@/lib/account-service';
import { accountDate } from '@/lib/dashboard';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
export default async function Requests() {
  const user=await currentUser();if(!user) redirect('/sign-in');
  const [requests,settings]=await Promise.all([ownedQuery(user.id,'select id,subject,message,status,response,created_at::text from support_requests where user_id=$1 order by created_at desc',[user.id]),readPreferences(user.id)]);
  return <div className="page-wrap"><PageHeading eyebrow="DASHBOARD / SUPPORT" title="Your support requests." description="Follow the status of requests submitted while signed in. Responses from our team appear here." /><div className="button-row"><Link className="button" href="/contact">Submit a request</Link><Link className="text-link" href="/support">Help center</Link></div><div className="stack">{requests.map(request=><article className="panel" key={request.id}><div className="flex justify-between items-start gap-4"><h2>{request.subject}</h2><span className="badge">{request.status.replace('_',' ')}</span></div><p className="small-copy break-all">Reference: {request.id} · {accountDate(request.created_at,settings.timezone)}</p><p className="whitespace-pre-wrap">{request.message}</p>{request.response?<div className="notice"><strong>One Fin response</strong><p className="whitespace-pre-wrap">{request.response}</p></div>:<p className="small-copy">Awaiting a response.</p>}</article>)}{!requests.length&&<div className="panel empty-state"><h2>No requests yet.</h2><p>If you need a hand, submit a request while signed in to track it here. Guest requests remain separate until ownership is verified.</p></div>}</div></div>;
}
