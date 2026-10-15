import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

function loadLedger(db) {
  const exports = {};
  const source = readFileSync(new URL('../lib/stripe-webhook-ledger.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (name === 'server-only') return {};
      if (name === './db') {
        return {
          query: async (text, params = []) => {
            const result = await db.query(text, params);
            return result.rows ?? [];
          },
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { STRIPE_MODE: 'test' } },
    console,
  });
  return exports;
}

async function withLedger(run) {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync(new URL('../migrations/railway/013_stripe_webhook_events.sql', import.meta.url), 'utf8'),
    );
    const ledger = loadLedger(db);
    await run(db, ledger);
  } finally {
    await db.close();
  }
}

function event(id = 'evt_test_1', type = 'invoice.paid') {
  return { id, type, livemode: false };
}

test('claim inserts new stripe webhook events as processing', async () => {
  await withLedger(async (db, ledger) => {
    const claim = await ledger.claimStripeWebhookEvent(event());
    assert.equal(claim.action, 'process');
    assert.equal(claim.attempts, 1);
    const rows = (await db.query('select * from stripe_webhook_events')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_id, 'evt_test_1');
    assert.equal(rows[0].status, 'processing');
    assert.equal(Number(rows[0].attempts), 1);
  });
});

test('duplicate delivery of a processed event is short-circuited', async () => {
  await withLedger(async (db, ledger) => {
    const first = await ledger.claimStripeWebhookEvent(event());
    assert.equal(first.action, 'process');
    await ledger.markStripeWebhookEventProcessed('evt_test_1');

    const duplicate = await ledger.claimStripeWebhookEvent(event());
    assert.equal(duplicate.action, 'skip_processed');

    const rows = (await db.query('select status, attempts from stripe_webhook_events')).rows;
    assert.equal(rows[0].status, 'processed');
    assert.equal(Number(rows[0].attempts), 1);
  });
});

test('in-flight processing event is not claimed twice', async () => {
  await withLedger(async (_db, ledger) => {
    const first = await ledger.claimStripeWebhookEvent(event());
    assert.equal(first.action, 'process');
    const second = await ledger.claimStripeWebhookEvent(event());
    assert.equal(second.action, 'skip_in_flight');
  });
});

test('failed events are recorded and can be retried', async () => {
  await withLedger(async (db, ledger) => {
    await ledger.claimStripeWebhookEvent(event());
    await ledger.markStripeWebhookEventFailed(
      'evt_test_1',
      new Error('fulfillment boom sk_test_SECRETVALUE Bearer tok_abc'),
    );

    const failed = (await db.query('select status, last_error, attempts from stripe_webhook_events')).rows[0];
    assert.equal(failed.status, 'failed');
    assert.match(failed.last_error, /fulfillment boom/);
    assert.doesNotMatch(failed.last_error, /sk_test_SECRETVALUE/);
    assert.doesNotMatch(failed.last_error, /tok_abc/);
    assert.match(failed.last_error, /\[redacted\]/);

    const retry = await ledger.claimStripeWebhookEvent(event());
    assert.equal(retry.action, 'process');
    assert.equal(retry.attempts, 2);

    const rows = (await db.query('select status, attempts, last_error from stripe_webhook_events')).rows[0];
    assert.equal(rows.status, 'processing');
    assert.equal(Number(rows.attempts), 2);
    assert.equal(rows.last_error, null);

    await ledger.markStripeWebhookEventProcessed('evt_test_1');
    const done = (
      await db.query(
        'select status, processed_at is not null as has_processed from stripe_webhook_events',
      )
    ).rows[0];
    assert.equal(done.status, 'processed');
    assert.equal(done.has_processed, true);

    const again = await ledger.claimStripeWebhookEvent(event());
    assert.equal(again.action, 'skip_processed');
  });
});

test('stale processing rows can be reclaimed after the lease window', async () => {
  await withLedger(async (db, ledger) => {
    await ledger.claimStripeWebhookEvent(event());
    await db.query(
      `update stripe_webhook_events
          set updated_at = now() - interval '20 minutes'
        where event_id = $1`,
      ['evt_test_1'],
    );

    const reclaim = await ledger.claimStripeWebhookEvent(event());
    assert.equal(reclaim.action, 'process');
    assert.equal(reclaim.attempts, 2);
  });
});

test('mark processed does not overwrite a failed row from another path', async () => {
  await withLedger(async (db, ledger) => {
    await ledger.claimStripeWebhookEvent(event());
    await ledger.markStripeWebhookEventFailed('evt_test_1', new Error('nope'));
    await ledger.markStripeWebhookEventProcessed('evt_test_1');
    const row = (await db.query('select status from stripe_webhook_events')).rows[0];
    assert.equal(row.status, 'failed');
  });
});
