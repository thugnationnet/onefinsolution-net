import 'server-only';
import { query } from './db';
import { emailConfigured, sendBillingEmail } from './email';
export async function queueBillingNotice(reference:string,userId:string,subject:string,body:string) {
  await query('insert into billing_notices(reference,user_id,subject,body) values($1,$2,$3,$4) on conflict(reference) do nothing',[reference,userId,subject,body]);
}
export async function deliverBillingNotices() {
  if(!emailConfigured()) return {sent:0,configured:false};
  const notices=await query(`update billing_notices set locked_until=now()+interval '5 minutes',attempts=attempts+1 where reference in
    (select reference from billing_notices where sent_at is null and (locked_until is null or locked_until<now()) order by created_at for update skip locked limit 10)
    returning reference,user_id,subject,body`);
  let sent=0;
  for(const notice of notices) {
    try {
      const [user]=await query('select email from app_users where id=$1',[notice.user_id]);
      await sendBillingEmail(user.email,notice.subject,notice.body,notice.reference);
      await query('update billing_notices set sent_at=now(),locked_until=null where reference=$1',[notice.reference]);sent++;
    } catch { /* Lease expiry permits retry. Never report delivery on failure. */ }
  }
  return {sent,configured:true};
}
