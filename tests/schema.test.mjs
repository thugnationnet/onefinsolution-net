import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
test('native Railway schema isolates profiles, contexts and chat messages with RLS',async()=>{
 const db=new PGlite(); const owner=randomUUID(),other=randomUUID(),chat=randomUUID();
 try {
  for(const name of ['001_schema.sql','002_credits.sql']) await db.exec(readFileSync(new URL(`../migrations/railway/${name}`,import.meta.url),'utf8'));
  await db.query("insert into app_users(id,email,password_hash) values($1,'one@example.test','fixture'),($2,'two@example.test','fixture')",[owner,other]);
  await db.query('insert into profiles(id) values($1),($2)',[owner,other]);
  await db.query('insert into chats(id,user_id) values($1,$2)',[chat,owner]);
  await db.exec(`set role app_user; set app.user_id='${other}';`);
  assert.equal((await db.query('select * from profiles')).rows.length,1);
  assert.equal((await db.query('select * from chats')).rows.length,0);
  await assert.rejects(db.query("insert into messages(chat_id,user_id,sender,content) values($1,$2,'user','forged')",[chat,other]),/row-level security/);
  await assert.rejects(db.query('select * from app_users'),/permission denied/);
  await db.exec(`reset role; set app.user_id='${owner}'; set role app_user;`);
  await db.query("insert into messages(chat_id,user_id,sender,content) values($1,$2,'user','owned')",[chat,owner]);
  assert.equal((await db.query('select * from messages')).rows.length,1);
 } finally {await db.close();}
});


test('stripe webhook event ledger migration is backward-compatible and unique on event_id', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync(new URL('../migrations/railway/013_stripe_webhook_events.sql', import.meta.url), 'utf8'),
    );
    await db.query(
      `insert into stripe_webhook_events (event_id, event_type, livemode, status)
       values ('evt_1', 'invoice.paid', false, 'processing')`,
    );
    await assert.rejects(
      db.query(
        `insert into stripe_webhook_events (event_id, event_type, livemode, status)
         values ('evt_1', 'invoice.paid', false, 'processing')`,
      ),
      /duplicate key|unique/i,
    );
    await assert.rejects(
      db.query(
        `insert into stripe_webhook_events (event_id, event_type, livemode, status)
         values ('evt_2', 'invoice.paid', false, 'done')`,
      ),
      /check/i,
    );
    await assert.rejects(
      db.query(
        `insert into stripe_webhook_events (event_id, event_type, livemode, status, processed_at)
         values ('evt_3', 'invoice.paid', false, 'processed', null)`,
      ),
      /check/i,
    );
    await db.query(
      `insert into stripe_webhook_events (event_id, event_type, livemode, status, processed_at)
       values ('evt_4', 'invoice.paid', false, 'processed', now())`,
    );
    assert.equal((await db.query('select * from stripe_webhook_events')).rows.length, 2);
  } finally {
    await db.close();
  }
});

test('014 software purchase accounting ledger', async () => {
  const db = new PGlite();
  const user = randomUUID();
  try {
    await db.exec(`
      create table app_users (
        id uuid primary key,
        email text not null,
        password_hash text not null
      );
    `);
    await db.exec(
      readFileSync(new URL('../migrations/railway/012_software_storefront_purchases.sql', import.meta.url), 'utf8'),
    );
    await db.exec(
      readFileSync(new URL('../migrations/railway/014_software_purchase_accounting.sql', import.meta.url), 'utf8'),
    );

    await db.query(
      "insert into app_users(id,email,password_hash) values($1,'soft@example.test','fixture')",
      [user],
    );

    const purchaseId = randomUUID();
    // Pending purchase: agreed $100, paid $0 (allowed after 014).
    await db.query(
      `insert into software_storefront_purchases
        (id,user_id,item_kind,item_id,item_name,customer_email,amount_paid_cents,total_price_cents,currency,status,inquiry_status)
       values ($1,$2,'template','tpl_1','Demo','soft@example.test',0,10000,'usd','pending','inquiry')`,
      [purchaseId, user],
    );

    await db.query(
      `insert into software_storefront_payments
        (purchase_id,user_id,amount_cents,currency,status,stripe_payment_intent_id,initiated_by,succeeded_at)
       values ($1,$2,2000,'usd','succeeded','pi_deposit','customer',now())`,
      [purchaseId, user],
    );

    await db.query(
      `update software_storefront_purchases
       set amount_paid_cents=2000, status='partially_paid'
       where id=$1`,
      [purchaseId],
    );

    await assert.rejects(
      db.query(
        `insert into software_storefront_payments
          (purchase_id,user_id,amount_cents,currency,status,stripe_payment_intent_id,initiated_by,succeeded_at)
         values ($1,$2,2000,'usd','succeeded','pi_deposit','customer',now())`,
        [purchaseId, user],
      ),
      /duplicate key|unique/i,
    );

    await assert.rejects(
      db.query(
        `insert into software_storefront_purchases
          (id,user_id,item_kind,item_id,item_name,customer_email,amount_paid_cents,total_price_cents,currency,status,inquiry_status)
         values ($1,$2,'template','tpl_2','Demo2','soft@example.test',0,5000,'usd','bogus','inquiry')`,
        [randomUUID(), user],
      ),
      /check/i,
    );

    const purchase = (await db.query(`select status,amount_paid_cents,total_price_cents,inquiry_status from software_storefront_purchases where id=$1`, [purchaseId])).rows[0];
    assert.equal(purchase.status, 'partially_paid');
    assert.equal(Number(purchase.amount_paid_cents), 2000);
    assert.equal(Number(purchase.total_price_cents), 10000);
    assert.equal(purchase.inquiry_status, 'inquiry');
    assert.equal(
      (await db.query(`select count(*)::int as n from software_storefront_payments where purchase_id=$1`, [purchaseId])).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test('015 workspace auto-reload settings columns', async () => {
  const db = new PGlite();
  const user = randomUUID();
  try {
    await db.exec(`
      create table app_users (
        id uuid primary key,
        email text not null,
        password_hash text not null
      );
      create table workspace_credit_settings (
        user_id uuid primary key references app_users(id) on delete cascade,
        payment_method_id text,
        card_brand text,
        card_last4 text,
        card_exp_month integer,
        card_exp_year integer,
        updated_at timestamptz not null default now()
      );
      create table workspace_credit_purchases (
        id uuid primary key,
        user_id uuid not null references app_users(id) on delete cascade,
        stripe_payment_intent text unique,
        amount integer not null check (amount > 0),
        credits integer not null check (credits > 0),
        status text not null check (status in ('pending','succeeded','failed')),
        created_at timestamptz not null default now()
      );
    `);
    await db.exec(
      readFileSync(new URL('../migrations/railway/015_workspace_auto_reload.sql', import.meta.url), 'utf8'),
    );
    await db.query(
      "insert into app_users(id,email,password_hash) values($1,'auto@example.test','fixture')",
      [user],
    );
    await db.query(
      `insert into workspace_credit_settings(user_id,auto_reload_enabled,auto_reload_threshold)
       values ($1,true,3)`,
      [user],
    );
    const row = (
      await db.query(
        `select auto_reload_enabled, auto_reload_threshold from workspace_credit_settings where user_id=$1`,
        [user],
      )
    ).rows[0];
    assert.equal(row.auto_reload_enabled, true);
    assert.equal(Number(row.auto_reload_threshold), 3);
  } finally {
    await db.close();
  }
});
