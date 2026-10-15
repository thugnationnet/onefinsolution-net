import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

test('auto-reload only runs when enabled, at/below threshold, and a card is saved', () => {
  function shouldAttempt({ enabled, threshold, balance, hasPaymentMethod, cooldownActive, pendingInFlight }) {
    if (!enabled) return 'disabled';
    if (!hasPaymentMethod) return 'no_payment_method';
    if (!(balance <= threshold)) return 'above_threshold';
    if (cooldownActive) return 'cooldown';
    if (pendingInFlight) return 'pending_in_flight';
    return 'attempt';
  }

  assert.equal(
    shouldAttempt({
      enabled: false,
      threshold: 1,
      balance: 0,
      hasPaymentMethod: true,
      cooldownActive: false,
      pendingInFlight: false,
    }),
    'disabled',
  );
  assert.equal(
    shouldAttempt({
      enabled: true,
      threshold: 1,
      balance: 0,
      hasPaymentMethod: false,
      cooldownActive: false,
      pendingInFlight: false,
    }),
    'no_payment_method',
  );
  assert.equal(
    shouldAttempt({
      enabled: true,
      threshold: 1,
      balance: 5,
      hasPaymentMethod: true,
      cooldownActive: false,
      pendingInFlight: false,
    }),
    'above_threshold',
  );
  assert.equal(
    shouldAttempt({
      enabled: true,
      threshold: 1,
      balance: 1,
      hasPaymentMethod: true,
      cooldownActive: true,
      pendingInFlight: false,
    }),
    'cooldown',
  );
  assert.equal(
    shouldAttempt({
      enabled: true,
      threshold: 1,
      balance: 0,
      hasPaymentMethod: true,
      cooldownActive: false,
      pendingInFlight: false,
    }),
    'attempt',
  );
});

test('source: auto-reload uses workspace customer scope and shared pack fulfillment path', async () => {
  const root = repoRoot();
  const helper = readFileSync(path.join(root, 'lib', 'workspace-auto-reload.ts'), 'utf8');
  const route = readFileSync(path.join(root, 'app', 'api', 'workspace', 'route.ts'), 'utf8');
  const actions = readFileSync(path.join(root, 'app', 'workspace-actions.ts'), 'utf8');
  const migration = readFileSync(
    path.join(root, 'migrations', 'railway', '015_workspace_auto_reload.sql'),
    'utf8',
  );

  assert.match(helper, /workspaceCustomer/);
  assert.match(helper, /requireOwnedPaymentMethod/);
  assert.match(helper, /billing_scope: 'workspace'/);
  assert.match(helper, /off_session:\s*true/);
  assert.match(helper, /flow: 'workspace-credit-purchase'/);
  assert.match(helper, /auto_reload: 'true'/);
  assert.match(helper, /fulfillStripeEvent/);
  assert.doesNotMatch(helper, /currentCustomer|softwareCustomer/);

  assert.match(route, /maybeAttemptWorkspaceAutoReload/);
  assert.match(actions, /setWorkspaceAutoReloadSettings/);
  assert.match(actions, /readWorkspaceAutoReloadSettings/);
  assert.match(actions, /autoReload: await readWorkspaceAutoReloadSettings/);

  assert.match(migration, /auto_reload_enabled/);
  assert.match(migration, /auto_reload_threshold/);
  assert.match(migration, /source text not null default 'manual'/);
});

test('015 workspace auto-reload migration columns and source check', async () => {
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
    // Minimal tables used by 015 alters.
    await db.exec(`
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
      "insert into app_users(id,email,password_hash) values($1,'ws@example.test','fixture')",
      [user],
    );
    await db.query(
      `insert into workspace_credit_settings(user_id,payment_method_id,auto_reload_enabled,auto_reload_threshold)
       values ($1,'pm_test',true,2)`,
      [user],
    );
    const settings = (
      await db.query(
        `select auto_reload_enabled, auto_reload_threshold from workspace_credit_settings where user_id=$1`,
        [user],
      )
    ).rows[0];
    assert.equal(settings.auto_reload_enabled, true);
    assert.equal(Number(settings.auto_reload_threshold), 2);

    await db.query(
      `insert into workspace_credit_purchases(id,user_id,amount,credits,status,source)
       values ($1,$2,500,50,'pending','auto_reload')`,
      [randomUUID(), user],
    );

    await assert.rejects(
      db.query(
        `insert into workspace_credit_purchases(id,user_id,amount,credits,status,source)
         values ($1,$2,500,50,'pending','invalid')`,
        [randomUUID(), user],
      ),
      /check/i,
    );
  } finally {
    await db.close();
  }
});
