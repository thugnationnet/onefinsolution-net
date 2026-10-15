import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pure isolation rules mirrored from lib/billing-scope.ts (node:test has no TS loader).
// Source-map tests below lock the real TypeScript call sites.

const BILLING_SCOPE_APP = {
  subscription: 'chatbot-template',
  workspace: 'chatbot-template',
  software: 'onefin-software-store',
};

class BillingScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BillingScopeError';
  }
}

function stripeCustomerId(customer) {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id || null;
}

function billingCustomerMetadata(scope, userId) {
  return {
    app: BILLING_SCOPE_APP[scope],
    billing_scope: scope,
    user_id: userId,
  };
}

function assertCustomerMatchesScope(customer, scope, userId) {
  if (customer.deleted) throw new BillingScopeError('Billing customer is no longer available.');
  const meta = customer.metadata || {};
  if (meta.user_id && meta.user_id !== userId) {
    throw new BillingScopeError('Billing customer does not belong to this account.');
  }
  if (meta.billing_scope && meta.billing_scope !== scope) {
    throw new BillingScopeError('Billing customer belongs to a different payment system.');
  }
  if (meta.app) {
    const expectedApp = BILLING_SCOPE_APP[scope];
    if (scope === 'software') {
      if (meta.app !== expectedApp) {
        throw new BillingScopeError('Billing customer belongs to a different payment system.');
      }
    } else if (meta.app === BILLING_SCOPE_APP.software) {
      throw new BillingScopeError('Billing customer belongs to a different payment system.');
    } else if (meta.app !== expectedApp) {
      throw new BillingScopeError('Billing customer belongs to a different payment system.');
    }
  }
}

async function requireOwnedPaymentMethod(stripe, customerId, paymentMethodId) {
  if (!customerId || !customerId.startsWith('cus_')) {
    throw new BillingScopeError('Billing customer is unavailable.');
  }
  if (!paymentMethodId || !paymentMethodId.startsWith('pm_')) {
    throw new BillingScopeError('Invalid payment method.');
  }
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  const ownerId = stripeCustomerId(paymentMethod.customer);
  if (!ownerId || ownerId !== customerId) {
    throw new BillingScopeError('Payment method is not available for this billing account.');
  }
  return paymentMethod;
}

function assertSetupIntentOwnedByCustomer(setup, customerId) {
  if (stripeCustomerId(setup.customer) !== customerId) {
    throw new BillingScopeError('Card setup does not belong to this billing account.');
  }
  if (setup.status !== 'succeeded') {
    throw new BillingScopeError('Card setup is not complete.');
  }
}

function customerFor(scope, userId) {
  return {
    id: `cus_${scope}_${userId.slice(0, 8)}`,
    deleted: undefined,
    livemode: false,
    metadata: billingCustomerMetadata(scope, userId),
  };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function sliceFn(source, name) {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  const next = source.indexOf('\nexport async function ', from);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

test('billing customer metadata is unique per system scope', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const sub = billingCustomerMetadata('subscription', userId);
  const ws = billingCustomerMetadata('workspace', userId);
  const soft = billingCustomerMetadata('software', userId);

  assert.equal(sub.billing_scope, 'subscription');
  assert.equal(ws.billing_scope, 'workspace');
  assert.equal(soft.billing_scope, 'software');
  assert.equal(soft.app, 'onefin-software-store');
  assert.equal(sub.app, 'chatbot-template');
  assert.equal(ws.app, 'chatbot-template');
  assert.notEqual(sub.billing_scope, ws.billing_scope);
  assert.notEqual(ws.billing_scope, soft.billing_scope);
});

test('assertCustomerMatchesScope rejects cross-system customers', () => {
  const userId = '22222222-2222-2222-2222-222222222222';
  const subscriptionCustomer = customerFor('subscription', userId);
  const workspaceCustomer = customerFor('workspace', userId);
  const softwareCustomer = customerFor('software', userId);

  assert.doesNotThrow(() => assertCustomerMatchesScope(subscriptionCustomer, 'subscription', userId));
  assert.doesNotThrow(() => assertCustomerMatchesScope(workspaceCustomer, 'workspace', userId));
  assert.doesNotThrow(() => assertCustomerMatchesScope(softwareCustomer, 'software', userId));

  assert.throws(
    () => assertCustomerMatchesScope(subscriptionCustomer, 'workspace', userId),
    /different payment system/,
  );
  assert.throws(
    () => assertCustomerMatchesScope(workspaceCustomer, 'software', userId),
    /different payment system/,
  );
  assert.throws(
    () => assertCustomerMatchesScope(softwareCustomer, 'subscription', userId),
    /different payment system/,
  );
  assert.throws(
    () => assertCustomerMatchesScope(subscriptionCustomer, 'subscription', '33333333-3333-3333-3333-333333333333'),
    /does not belong to this account/,
  );
});

test('legacy customers without metadata remain usable for their mapped scope', () => {
  const userId = '44444444-4444-4444-4444-444444444444';
  const legacy = { id: 'cus_legacy', metadata: {}, livemode: false };
  assert.doesNotThrow(() => assertCustomerMatchesScope(legacy, 'subscription', userId));
  assert.doesNotThrow(() => assertCustomerMatchesScope(legacy, 'workspace', userId));
});

test('requireOwnedPaymentMethod rejects cards attached to another system customer', async () => {
  const subscriptionCustomerId = 'cus_sub_owner';
  const workspaceCustomerId = 'cus_ws_owner';
  const softwareCustomerId = 'cus_soft_owner';

  const methods = {
    pm_sub: { id: 'pm_sub', customer: subscriptionCustomerId },
    pm_ws: { id: 'pm_ws', customer: workspaceCustomerId },
    pm_soft: { id: 'pm_soft', customer: softwareCustomerId },
  };

  const stripe = {
    paymentMethods: {
      retrieve: async (id) => {
        const method = methods[id];
        if (!method) throw new Error('missing');
        return method;
      },
    },
  };

  await assert.doesNotReject(() => requireOwnedPaymentMethod(stripe, subscriptionCustomerId, 'pm_sub'));
  await assert.doesNotReject(() => requireOwnedPaymentMethod(stripe, workspaceCustomerId, 'pm_ws'));
  await assert.doesNotReject(() => requireOwnedPaymentMethod(stripe, softwareCustomerId, 'pm_soft'));

  await assert.rejects(
    () => requireOwnedPaymentMethod(stripe, subscriptionCustomerId, 'pm_ws'),
    /not available for this billing account/,
  );
  await assert.rejects(
    () => requireOwnedPaymentMethod(stripe, workspaceCustomerId, 'pm_soft'),
    /not available for this billing account/,
  );
  await assert.rejects(
    () => requireOwnedPaymentMethod(stripe, softwareCustomerId, 'pm_sub'),
    /not available for this billing account/,
  );
  await assert.rejects(
    () => requireOwnedPaymentMethod(stripe, subscriptionCustomerId, 'not_a_pm'),
    /Invalid payment method/,
  );
});

test('assertSetupIntentOwnedByCustomer rejects setups for other customers', () => {
  const customerId = 'cus_scope_a';
  assert.doesNotThrow(() =>
    assertSetupIntentOwnedByCustomer({ customer: customerId, status: 'succeeded', livemode: false }, customerId),
  );
  assert.throws(
    () =>
      assertSetupIntentOwnedByCustomer(
        { customer: 'cus_other_scope', status: 'succeeded', livemode: false },
        customerId,
      ),
    /does not belong to this billing account/,
  );
  assert.throws(
    () =>
      assertSetupIntentOwnedByCustomer(
        { customer: customerId, status: 'requires_payment_method', livemode: false },
        customerId,
      ),
    /not complete/,
  );
});

test('source maps keep three dedicated customer tables', async () => {
  const root = repoRoot();
  const fs = await import('node:fs/promises');
  const sub = await fs.readFile(path.join(root, 'lib', 'stripe-billing.ts'), 'utf8');
  const ws = await fs.readFile(path.join(root, 'lib', 'workspace-stripe.ts'), 'utf8');
  const soft = await fs.readFile(path.join(root, 'lib', 'software-stripe.ts'), 'utf8');

  assert.match(sub, /billing_customers/);
  assert.doesNotMatch(sub, /workspace_billing_customers/);
  assert.doesNotMatch(sub, /software_billing_customers/);

  assert.match(ws, /workspace_billing_customers/);
  assert.doesNotMatch(ws, /from billing_customers/);
  assert.doesNotMatch(ws, /software_billing_customers/);

  assert.match(soft, /software_billing_customers/);
  assert.doesNotMatch(soft, /workspace_billing_customers/);
  assert.doesNotMatch(soft, /from billing_customers/);

  assert.match(sub, /assertCustomerMatchesScope\([^,]+,\s*'subscription'/);
  assert.match(ws, /assertCustomerMatchesScope\([^,]+,\s*'workspace'/);
  assert.match(soft, /assertCustomerMatchesScope\([^,]+,\s*'software'/);

  assert.match(sub, /billingCustomerMetadata\('subscription'/);
  assert.match(ws, /billingCustomerMetadata\('workspace'/);
  assert.match(soft, /billingCustomerMetadata\('software'/);
});

test('payment method actions resolve customers server-side and require ownership', async () => {
  const root = repoRoot();
  const fs = await import('node:fs/promises');

  const pma = await fs.readFile(path.join(root, 'app', 'payment-method-actions.ts'), 'utf8');
  const workspace = await fs.readFile(path.join(root, 'app', 'workspace-actions.ts'), 'utf8');
  const software = await fs.readFile(path.join(root, 'app', 'software', 'checkout', 'actions.ts'), 'utf8');
  const enrollment = await fs.readFile(path.join(root, 'lib', 'subscription-enrollment.ts'), 'utf8');

  assert.match(pma, /from '@\/lib\/stripe-billing'/);
  assert.match(pma, /requireOwnedPaymentMethod/);
  assert.match(pma, /currentCustomer/);
  assert.doesNotMatch(pma, /workspaceCustomer|softwareCustomer/);

  assert.match(workspace, /workspaceCustomer/);
  assert.match(workspace, /requireOwnedPaymentMethod/);
  assert.doesNotMatch(workspace, /currentCustomer\(|softwareCustomer/);

  assert.match(software, /softwareCustomer/);
  assert.match(software, /requireOwnedPaymentMethod/);
  assert.doesNotMatch(software, /currentCustomer\(|workspaceCustomer/);

  assert.match(enrollment, /currentCustomer/);
  assert.match(enrollment, /requireOwnedPaymentMethod/);
  assert.doesNotMatch(enrollment, /workspaceCustomer|softwareCustomer/);
});

test('default payment method updates only target the scoped customer', async () => {
  const root = repoRoot();
  const fs = await import('node:fs/promises');
  const pma = await fs.readFile(path.join(root, 'app', 'payment-method-actions.ts'), 'utf8');
  const workspace = await fs.readFile(path.join(root, 'app', 'workspace-actions.ts'), 'utf8');
  const software = await fs.readFile(path.join(root, 'app', 'software', 'checkout', 'actions.ts'), 'utf8');

  const setSub = sliceFn(pma, 'setDefaultPaymentMethodAction');
  const setWs = sliceFn(workspace, 'setWorkspaceDefaultPaymentMethod');
  const setSoft = sliceFn(software, 'setSoftwareDefaultPaymentMethod');

  assert.match(setSub, /requireOwnedPaymentMethod/);
  assert.match(setSub, /invoice_settings:\s*\{\s*default_payment_method/);
  assert.doesNotMatch(setSub, /workspaceCustomer|softwareCustomer/);

  assert.match(setWs, /requireOwnedPaymentMethod/);
  assert.match(setWs, /workspaceCustomer/);
  assert.doesNotMatch(setWs, /softwareCustomer|currentCustomer\(/);

  assert.match(setSoft, /requireOwnedPaymentMethod/);
  assert.match(setSoft, /softwareCustomer/);
  assert.doesNotMatch(setSoft, /workspaceCustomer|currentCustomer\(/);
});
