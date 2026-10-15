import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
const user = randomUUID();
const other = randomUUID();
before(async () => {
  for(const file of ['001_schema.sql','002_credits.sql']) await db.exec(readFileSync(new URL(`../migrations/railway/${file}`,import.meta.url),'utf8'));
  await db.query("insert into app_users(id,email,password_hash,email_verified_at) values($1,'first@example.test','fixture',now()),($2,'other@example.test','fixture',now())",[user,other]);
});
after(() => db.close());
async function grant(owner, ref, amount, expires = null) {
  return db.query('select public.grant_credits($1,$2,$3,$4)', [owner,ref,amount,expires]);
}
async function balance(owner) {
  return Number((await db.query('select coalesce(sum(remaining),0) as balance from public.credit_buckets where user_id=$1 and (expires_at is null or expires_at > now())', [owner])).rows[0].balance);
}
test('duplicate payment delivery grants only once and conflicting ownership is rejected', async () => {
  await grant(user,'payment:first',5);
  await grant(user,'payment:first',5);
  assert.equal(await balance(user),5);
  await assert.rejects(grant(other,'payment:first',5), /Conflicting credit grant/);
  await assert.rejects(grant(user,'negative',-1), /Invalid credit grant/);
});
test('expired subscription credits cannot be spent; failed reservations roll back completely', async () => {
  await grant(other,'expired',100,'2020-01-01T00:00:00Z');
  const request = randomUUID();
  await assert.rejects(db.query('select public.reserve_credits($1,$2,$3)',[other,request,1]), /Insufficient credits/);
  assert.equal((await db.query('select count(*)::int as count from public.credit_usage where id=$1',[request])).rows[0].count,0);
  assert.equal(await balance(other),0);
});
test('reservations consume expiring credits first and refunds happen only once', async () => {
  await grant(user,'renewal',3,'2099-01-01T00:00:00Z');
  const request = randomUUID();
  await db.query('select public.reserve_credits($1,$2,$3)',[user,request,4]);
  assert.equal(await balance(user),4);
  const buckets = (await db.query('select reference,remaining::int from public.credit_buckets where user_id=$1',[user])).rows;
  assert.equal(buckets.find(bucket => bucket.reference === 'renewal').remaining,0);
  await assert.rejects(db.query('select public.reserve_credits($1,$2,$3)',[user,request,1]), /Duplicate request/);
  await db.query('select public.finish_credit_usage($1,$2,false)',[user,request]);
  await db.query('select public.finish_credit_usage($1,$2,false)',[user,request]);
  assert.equal(await balance(user),8);
});
test('completed usage cannot be refunded and another user cannot finalize it', async () => {
  const request = randomUUID();
  await db.query('select public.reserve_credits($1,$2,1)',[user,request]);
  await assert.rejects(db.query('select public.finish_credit_usage($1,$2,false)',[other,request]), /Unknown request/);
  await db.query('select public.finish_credit_usage($1,$2,true)',[user,request]);
  await db.query('select public.finish_credit_usage($1,$2,false)',[user,request]);
  assert.equal(await balance(user),7);
});
test('parallel reservations cannot overspend a balance', async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => db.query('select public.reserve_credits($1,$2,1)',[user,randomUUID()])));
  assert.equal(results.filter(result => result.status === 'fulfilled').length,7);
  assert.equal(await balance(user),0);
});
test('RLS isolates balances and browser roles cannot mint or refund credits', async () => {
  await db.exec(`set app.user_id='${other}'; set role app_user;`);
  try {
    const rows = (await db.query('select distinct user_id from public.credit_buckets')).rows;
    assert.ok(rows.every(row => row.user_id === other));
    await assert.rejects(db.query('select public.grant_credits($1,$2,10)',[other,'forged']), /permission denied/);
    await assert.rejects(db.query('select public.reserve_credits($1,$2,1)',[other,randomUUID()]), /permission denied/);
    await assert.rejects(db.query('select public.finish_credit_usage($1,$2,false)',[other,randomUUID()]), /permission denied/);
    await assert.rejects(db.query('insert into public.credit_buckets(user_id,reference,total,remaining) values($1,$2,10,10)',[other,'forged']), /permission denied/);
  } finally { await db.exec('reset role'); }
});
test('concurrent checkout retries share one stable request identity per account', async () => {
  const attempts = await Promise.all(Array.from({ length: 5 }, () => db.query("select public.begin_billing_checkout($1,'price_basic') as attempt",[user])));
  const identities = new Set(attempts.map(result => result.rows[0].attempt.request_id));
  assert.equal(identities.size,1);
  const retry = (await db.query("select public.begin_billing_checkout($1,'price_pro') as attempt",[user])).rows[0].attempt;
  assert.equal(retry.price_id,'price_basic');
  assert.ok(identities.has(retry.request_id));
});
test('reservations abandoned by a crashed worker are refunded after the timeout', async () => {
  await grant(other,'crash-recovery',2);
  const request = randomUUID();
  await db.query('select public.reserve_credits($1,$2,1)',[other,request]);
  assert.equal(await balance(other),1);
  await db.query("update public.credit_usage set created_at=now()-interval '11 minutes' where id=$1",[request]);
  await db.query('select public.reconcile_credit_usage($1)',[other]);
  await db.query('select public.reconcile_credit_usage($1)',[other]);
  assert.equal(await balance(other),2);
});
