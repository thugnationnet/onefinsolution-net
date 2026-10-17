'use server';

import { currentUser } from '@/lib/session';
import { currentCustomer } from '@/lib/stripe-billing';
import { verifiedStripe } from '@/lib/stripe';
import {
  assertCustomerMatchesScope,
  requireOwnedPaymentMethod,
  stripePaymentMethodId,
} from '@/lib/billing-scope';
import { throttle } from '@/lib/auth-service';
import { randomUUID } from 'node:crypto';
import { fulfillStripeEvent } from '@/lib/stripe-fulfillment';
import { expectedStripeLivemode, stripeObjectMatchesMode } from '@/lib/billing-environment';
import { query } from '@/lib/db';
import type Stripe from 'stripe';
import { sitePath } from '@/lib/site-url';
import { setSubscriptionDefault } from '@/lib/subscription-payment-methods';
import { resolvePresentmentCurrency } from '@/lib/billing-currency';

async function context() {
  const user = await currentUser();
  if (!user) throw new Error('Please sign in.');
  await throttle(`payment-method:${user.id}`, 20);
  const customer = await currentCustomer();
  if (!customer) throw new Error('No billing account exists yet.');
  return { user, customer, stripe: await verifiedStripe() };
}

export type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

export async function listPaymentMethodsAction(): Promise<
  { methods: SavedPaymentMethod[]; customerId: string } | { error: string }
> {
  try {
    const { user, customer, stripe } = await context();
    const customerObj = await stripe.customers.retrieve(customer);
    try {
      assertCustomerMatchesScope(customerObj, 'subscription', user.id);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Billing customer is no longer available.' };
    }
    const defaultId =
      typeof customerObj.invoice_settings?.default_payment_method === 'string'
        ? customerObj.invoice_settings.default_payment_method
        : customerObj.invoice_settings?.default_payment_method?.id || null;

    const legacyWorkspaceMethods = await query<{ payment_method_id: string }>(
      'select payment_method_id from workspace_legacy_payment_methods where user_id=$1',
      [user.id],
    );
    const legacyWorkspaceIds = new Set(legacyWorkspaceMethods.map(({ payment_method_id }) => payment_method_id));
    const legacyCustomers = await query<{ customer_id: string }>(
      'select customer_id from workspace_legacy_billing_customers where user_id=$1',
      [user.id],
    );
    if (legacyCustomers.some(({ customer_id }) => customer_id === customer)) {
      for await (const intent of stripe.paymentIntents.list({ customer, limit: 100 })) {
        if (intent.metadata?.app === 'chatbot-template' && intent.metadata.flow === 'workspace-credit-purchase') {
          const id = stripePaymentMethodId(intent.payment_method);
          if (id) legacyWorkspaceIds.add(id);
        }
      }
    }
    const methods: SavedPaymentMethod[] = [];
    for await (const pm of stripe.paymentMethods.list({ customer, type: 'card', limit: 100 })) {
      if (legacyWorkspaceIds.has(pm.id)) continue;
      methods.push({
        id: pm.id,
        brand: pm.card?.brand || 'card',
        last4: pm.card?.last4 || '••••',
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        isDefault: pm.id === defaultId,
      });
    }
    methods.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { methods, customerId: customer };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to load payment methods.',
    };
  }
}



export async function setDefaultPaymentMethodAction(paymentMethodId: string) {
  try {
    const { customer, stripe } = await context();
    await setSubscriptionDefault(stripe, customer, paymentMethodId);
    return { success: true as const, message: 'Default payment method updated.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to set default payment method.',
    };
  }
}


export async function detachPaymentMethodAction(paymentMethodId: string) {
  try {
    const { customer, stripe } = await context();
    await requireOwnedPaymentMethod(stripe, customer, paymentMethodId);

    const customerObj = await stripe.customers.retrieve(customer);
    if (!customerObj.deleted) {
      const defaultId =
        typeof customerObj.invoice_settings?.default_payment_method === 'string'
          ? customerObj.invoice_settings.default_payment_method
          : customerObj.invoice_settings?.default_payment_method?.id || null;
      if (defaultId === paymentMethodId) {
        return { error: 'Set another default card before removing this one.' };
      }
    }

    for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
      if (!['canceled', 'incomplete_expired'].includes(sub.status) && stripePaymentMethodId(sub.default_payment_method) === paymentMethodId) {
        return { error: 'This card is used for subscription renewal. Set another default card first.' };
      }
    }
    await stripe.paymentMethods.detach(paymentMethodId);
    return { success: true as const, message: 'Payment method removed.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to remove this payment method.',
    };
  }
}

export async function addSubscriptionPaymentMethodAction() {
  try {
    const user = await currentUser();
    if (!user) throw new Error('Please sign in.');
    await throttle(`payment-method:${user.id}`, 20);
    const customer = await currentCustomer(true);
    if (!customer) throw new Error('Billing account unavailable.');
    const stripe = verifiedStripe();
    const metadata = { app: 'chatbot-template', billing_scope: 'subscription', flow: 'subscription-card-setup', user_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: 'setup', customer, client_reference_id: user.id,
      allowed_payment_method_types: ['card'], currency: await resolvePresentmentCurrency(stripe),
      metadata, setup_intent_data: { metadata },
      success_url: sitePath('/subscribe/return?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: sitePath('/dashboard/billing?billing=cancelled'),
    }, { idempotencyKey: `subscription-card:${user.id}:${randomUUID()}` });
    if (!session.url || !stripeObjectMatchesMode(session.livemode)) throw new Error('Card setup is unavailable.');
    return { url: session.url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to add a payment method.' };
  }
}


export async function retrySubscriptionPayment(subscriptionId: string) {
  try {
    const { customer, stripe } = await context();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (
      !stripeObjectMatchesMode(sub.livemode) ||
      sub.customer !== customer ||
      sub.metadata.app !== 'chatbot-template'
    ) {
      throw new Error();
    }
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
    if (!invoiceId) throw new Error();
    let invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['confirmation_secret'] });
    if (!stripeObjectMatchesMode(invoice.livemode)) throw new Error();
    if (invoice.status !== 'paid') {
      try {
        invoice = await stripe.invoices.pay(invoiceId, { expand: ['confirmation_secret'] });
      } catch {
        invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['confirmation_secret'] });
      }
      if (!stripeObjectMatchesMode(invoice.livemode)) throw new Error();
    }
    if (invoice.status === 'paid') {
      await fulfillStripeEvent(stripe, {
        type: 'invoice.paid',
        livemode: expectedStripeLivemode(),
        data: { object: { id: invoice.id } },
      } as Stripe.Event);
      return { paid: true };
    }
    if (invoice.confirmation_secret?.client_secret) {
      return { secret: invoice.confirmation_secret.client_secret };
    }
    return { error: 'Payment could not complete. Update your card and retry.' };
  } catch {
    return { error: 'Unable to retry this payment. Please contact support.' };
  }
}
