import 'server-only';
import { query, transaction } from './db';
import { hashPassword, verifyPassword, randomToken, tokenHash } from './password';
import { sendAuthEmail, sendPasswordChangedEmail, sendWelcomeEmail, sendAccountUpdatedEmail, emailConfigured } from './email';
import { siteUrl } from './site-url';
export function normalizeEmail(value:string) {
  const email=value.trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}
export async function throttle(key:string,limit=10) {
  const [result]=await query<{attempts:number}>(`insert into auth_rate_limits(key,attempts,expires_at) values($1,1,now()+interval '15 minutes') on conflict(key) do update set attempts=case when auth_rate_limits.expires_at<now() then 1 else auth_rate_limits.attempts+1 end, expires_at=case when auth_rate_limits.expires_at<now() then now()+interval '15 minutes' else auth_rate_limits.expires_at end returning attempts`,[tokenHash(key)]);
  if(result.attempts>limit) throw new Error('Too many attempts. Please try again in 15 minutes.');
}
export async function sendToken(userId:string,email:string,purpose:'verify'|'reset') {
  const token=randomToken(), hash=tokenHash(token);
  await query(`insert into auth_tokens(token_hash,user_id,purpose,expires_at) values($1,$2,$3,now()+$4::interval)`,[hash,userId,purpose,purpose==='verify'?'24 hours':'30 minutes']);
  try { await sendAuthEmail(email,`${siteUrl()}/auth/callback?purpose=${purpose}&token=${encodeURIComponent(token)}`,purpose); }
  catch(error) { await query('delete from auth_tokens where token_hash=$1',[hash]); throw error; }
}
export async function register(emailInput:string,password:string) {
  const email=normalizeEmail(emailInput);
  await throttle(`signup:${email}`,5);
  const hash=await hashPassword(password);
  const user=await transaction(async client=>{
    const {rows}=await client.query(`insert into app_users(email,password_hash,email_verified_at) values($1,$2,now()) on conflict(email) do nothing returning id,email`,[email,hash]);
    if(!rows.length) return null;
    await client.query('insert into profiles(id) values($1)',[rows[0].id]);
    return rows[0];
  });
  if(!user) throw new Error('An account with this email already exists. Please sign in.');
  return {id:user.id,email:user.email};
}
export async function authenticate(emailInput:string,password:string) {
  const email=normalizeEmail(emailInput);
  await throttle(`signin:${email}`,10);
  const [user]=await query<{id:string;password_hash:string;email_verified_at:string|null}>('select id,password_hash,email_verified_at from app_users where email=$1',[email]);
  const valid=await verifyPassword(password,user?.password_hash || 'scrypt-v1:00000000000000000000000000000000:'+'00'.repeat(64));
  if(!user || !valid) throw new Error('Email or password is incorrect.');
  return user.id;
}
export async function requestEmailToken(emailInput:string,purpose:'verify'|'reset') {
  const email=normalizeEmail(emailInput);
  await throttle(`${purpose}:${email}`,5);
  if(!emailConfigured()) return; // Skip silently when email is not configured
  const [user]=await query<{id:string;email_verified_at:string|null}>('select id,email_verified_at from app_users where email=$1',[email]);
  if(user && (purpose==='reset' || !user.email_verified_at)) await sendToken(user.id,email,purpose);
}
export async function consumeVerification(token:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid or expired confirmation link.');
  return transaction(async client=>{
    const {rows}=await client.query(`delete from auth_tokens where token_hash=$1 and purpose='verify' and expires_at>now() returning user_id`,[tokenHash(token)]);
    if(!rows.length) throw new Error('Invalid or expired confirmation link.');
    await client.query('update app_users set email_verified_at=coalesce(email_verified_at,now()) where id=$1',[rows[0].user_id]);
    await client.query("delete from auth_tokens where user_id=$1 and purpose='verify'",[rows[0].user_id]);
    return rows[0].user_id as string;
  });
}
export async function resetPassword(token:string,password:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Request a new password reset link.');
  const hash=await hashPassword(password);
  let userEmail: string | null = null;
  await transaction(async client=>{
    const {rows}=await client.query(`delete from auth_tokens where token_hash=$1 and purpose='reset' and expires_at>now() returning user_id`,[tokenHash(token)]);
    if(!rows.length) throw new Error('Invalid or expired password reset link.');
    const userId = rows[0].user_id as string;
    await client.query('update app_users set password_hash=$1 where id=$2',[hash,userId]);
    await client.query('delete from app_sessions where user_id=$1',[userId]);
    await client.query("delete from auth_tokens where user_id=$1 and purpose='reset'",[userId]);
    const emailRows = await client.query<{email:string}>('select email from app_users where id=$1',[userId]);
    userEmail = emailRows.rows[0]?.email || null;
  });
  if (userEmail) {
    try { await sendPasswordChangedEmail(userEmail, '/sign-in'); } catch { /* non-blocking confirmation */ }
  }
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  if (nextPassword.length < 12) throw new Error('Use at least 12 characters for your new password.');
  const rows = await query<{ password_hash: string; email: string }>(
    'select password_hash, email from app_users where id=$1 limit 1',
    [userId],
  );
  const row = rows[0];
  if (!row?.password_hash) throw new Error('Account password is not available.');
  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) throw new Error('Current password is incorrect.');
  const hash = await hashPassword(nextPassword);
  await query('update app_users set password_hash=$1, updated_at=now() where id=$2', [hash, userId]);
  await query('delete from app_sessions where user_id=$1', [userId]);
  try {
    await sendPasswordChangedEmail(row.email, '/sign-in');
  } catch {
    /* confirmation email is best-effort */
  }
}
