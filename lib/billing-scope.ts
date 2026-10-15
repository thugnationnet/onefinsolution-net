import 'server-only';
import type Stripe from 'stripe';
import { stripeObjectMatchesMode } from './billing-environment';

/** Isolated payment systems that each own a dedicated Stripe Customer mapping. */
export type BillingScope = 'subscription' | 'workspace' | 'software';

export const BILLING_SCOPE_APP: Record<BillingScope, string> = {
  subscription: 'chatbot-template',
  workspace: 'chatbot-template',
  software: 'onefin-software-store',
};

export class BillingScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingScopeError';
  }
}

export function stripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id || null;
}

export function stripePaymentMethodId(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined,
): string | null {
  if (!paymentMethod) return null;
  return typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id || null;
}

/** Metadata stamped on every newly created scoped Stripe Customer. */
export function billingCustomerMetadata(scope: BillingScope, userId: string): Stripe.MetadataParam {
  return {
    app: BILLING_SCOPE_APP[scope],
    billing_scope: scope,
    user_id: userId,
  };
}

/**
 * Verifies a retrieved Stripe Customer belongs to the expected user + system scope.
 * Missing legacy metadata is allowed (pre-isolation customers); conflicting metadata is rejected.
 */
export function assertCustomerMatchesScope(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  scope: BillingScope,
  userId: string,
): asserts customer is Stripe.Customer {
  if (customer.deleted) {
    throw new BillingScopeError('Billing customer is no longer available.');
  }
  if (!stripeObjectMatchesMode(customer.livemode)) {
    throw new BillingScopeError('Billing customer mode mismatch.');
  }

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

/**
 * Ensures a PaymentMethod ID is attached to the given scoped customer.
 * Never trusts client-supplied customer IDs — caller must pass the server-resolved customer.
 */
export async function requireOwnedPaymentMethod(
  stripe: Stripe,
  customerId: string,
  paymentMethodId: string,
): Promise<Stripe.PaymentMethod> {
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

/** Ensures a SetupIntent belongs to the server-resolved scoped customer. */
export function assertSetupIntentOwnedByCustomer(
  setup: Stripe.SetupIntent,
  customerId: string,
): void {
  if (!stripeObjectMatchesMode(setup.livemode)) {
    throw new BillingScopeError('Card setup mode mismatch.');
  }
  if (stripeCustomerId(setup.customer) !== customerId) {
    throw new BillingScopeError('Card setup does not belong to this billing account.');
  }
  if (setup.status !== 'succeeded') {
    throw new BillingScopeError('Card setup is not complete.');
  }
}
