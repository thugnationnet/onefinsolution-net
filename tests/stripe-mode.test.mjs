import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadBillingEnvironment(mode) {
  const exports = {};
  const source = readFileSync(new URL('../lib/billing-environment.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, { exports, process: { env: mode ? { STRIPE_MODE: mode } : {} } });
  return exports;
}

test('Stripe billing defaults to test mode and validates explicit modes', () => {
  const testMode = loadBillingEnvironment(undefined);
  assert.equal(testMode.expectedStripeLivemode(), false);
  assert.equal(testMode.stripeObjectMatchesMode(false), true);
  assert.equal(testMode.stripeObjectMatchesMode(true), false);

  const liveMode = loadBillingEnvironment('live');
  assert.equal(liveMode.expectedStripeLivemode(), true);
  assert.equal(liveMode.stripeObjectMatchesMode(true), true);
  assert.equal(liveMode.stripeObjectMatchesMode(false), false);

  assert.throws(() => loadBillingEnvironment('invalid').billingEnvironment(), /STRIPE_MODE must be test or live/);
});
