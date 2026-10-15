import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const __dirname = dirname(fileURLToPath(import.meta.url));

function load(file, env) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  runInNewContext(outputText, { exports, process: { env }, URL });
  return exports;
}

test('a production build must still select Test Mode billing', () => {
  assert.equal(load('lib/billing-environment.ts', { NODE_ENV: 'production' }).billingEnvironment(), 'test');
  assert.equal(load('lib/billing-environment.ts', { NODE_ENV: 'production', STRIPE_MODE: 'test' }).billingEnvironment(), 'test');
});
test('Live Mode requires an explicit mode and misspelled billing environments fail closed', () => {
  assert.equal(load('lib/billing-environment.ts', { NODE_ENV: 'production', STRIPE_MODE: 'live' }).billingEnvironment(), 'live');
  for (const environment of ['production', 'TEST']) {
    assert.throws(() => load('lib/billing-environment.ts', { STRIPE_MODE: environment }).billingEnvironment(), /STRIPE_MODE must be test or live/);
  }
});
test('production redirects cannot silently fall back to localhost or HTTP', () => {
  for (const value of [undefined, 'http://app.example.com', 'https://localhost:3000', 'https://127.0.0.1']) {
    assert.throws(() => load('lib/site-url.ts', { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: value }).siteUrl());
  }
  assert.equal(load('lib/site-url.ts', { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://app.example.com/path' }).siteUrl(), 'https://app.example.com');
  assert.equal(load('lib/site-url.ts', { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://app.example.com' }).sitePath('/subscribe'), 'https://app.example.com/subscribe');
});
test('Workspace credit prices reject subscription plans and use the Workspace-only task cost', () => {
  const credits = load('lib/credit-config.ts', {
    STRIPE_CREDIT_PLANS: JSON.stringify({ price_workspace: { credits: 50, kind: 'pack' } }),
    WORKSPACE_CREDIT_COST: '2',
    CHAT_CREDIT_COST: '9',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(credits.creditPlans())), {
    price_workspace: { credits: 50, kind: 'pack' },
  });
  assert.equal(credits.workspaceCreditCost(), 2);

  const legacyCost = load('lib/credit-config.ts', { CHAT_CREDIT_COST: '3' });
  assert.equal(legacyCost.workspaceCreditCost(), 3);

  const subscriptionPrice = load('lib/credit-config.ts', {
    STRIPE_CREDIT_PLANS: JSON.stringify({ price_chat: { credits: 100, kind: 'subscription' } }),
  });
  assert.throws(() => subscriptionPrice.creditPlans(), /Invalid STRIPE_CREDIT_PLANS/);
});
test('retired saved selections resolve to a supported model without rewriting history', () => {
  const models = load('lib/models.ts', {});
  for (const retired of ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20240620', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']) {
    assert.ok(models.availableModels.some(model => model.id === models.normalizeModel(retired)));
  }
});
test('all private pages redirect guests, including nested chat and context routes', () => {
  const { authRedirect } = load('lib/auth-redirect.ts', {});
  for (const path of ['/account', '/account/security', '/dashboard', '/dashboard/support', '/chat', '/context', '/context/new', '/context/123', '/c/123']) {
    assert.equal(authRedirect(path, false), '/sign-in');
    assert.equal(authRedirect(path, true), null);
  }
  for (const path of ['/', '/pricing', '/workspace', '/workspace/settings', '/reset-password', '/forgot-password', '/auth/callback', '/confirmation']) {
    assert.equal(authRedirect(path, false), null);
  }
  assert.equal(authRedirect('/sign-in', true), '/');
  assert.equal(authRedirect('/sign-up', true), '/');
});
