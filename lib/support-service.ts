import 'server-only';
import { query } from './db';
import { normalizeEmail, throttle } from './auth-service';
export const supportCategories = { general:'General question',technical:'Technical support',billing:'Billing & refund',privacy:'Privacy request',account:'Account access',pricing:'Plan inquiry' };
export async function submitSupportRequest(form:FormData,identity:{id:string;email:string}|null,ip:string) {
  if(form.get('website_url')) throw new Error('Unable to submit this request.');
  const name=String(form.get('name')||'').trim(), email=normalizeEmail(identity?.email || String(form.get('email')||''));
  const category=String(form.get('category')||'general'),subject=String(form.get('subject')||'').trim(),message=String(form.get('message')||'').trim();
  if(!name || name.length>120 || subject.length<3 || subject.length>160 || message.length<20 || message.length>6000 || !Object.hasOwn(supportCategories,category)) throw new Error('Enter your name, a subject of 3–160 characters, and a message of 20–6,000 characters.');
  await throttle(`support-ip:${ip}`,8);
  await throttle(`support-email:${email}`,5);
  const [ticket]=await query<{id:string}>('insert into support_requests(user_id,name,email,category,subject,message) values($1,$2,$3,$4,$5,$6) returning id',[identity?.id||null,name,email,category,subject,message]);
  return ticket.id;
}
