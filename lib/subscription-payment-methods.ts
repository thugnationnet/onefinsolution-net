import 'server-only';
import type Stripe from 'stripe';
import { requireOwnedPaymentMethod } from './billing-scope';
import { stripeObjectMatchesMode } from './billing-environment';

export async function setSubscriptionDefault(stripe: Stripe, customer: string, paymentMethodId: string) {
  await requireOwnedPaymentMethod(stripe, customer, paymentMethodId);
  for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
    if (stripeObjectMatchesMode(sub.livemode) && sub.metadata.app === 'chatbot-template' &&
        (!sub.metadata.billing_scope || sub.metadata.billing_scope === 'subscription') &&
        !['canceled', 'incomplete_expired'].includes(sub.status)) {
      if (sub.schedule) {
        const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id;
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        if (schedule.metadata?.app !== 'chatbot-template') throw new Error('This subscription schedule is managed externally. Contact support to update its card.');
        await stripe.subscriptionSchedules.update(scheduleId, { default_settings: { default_payment_method: paymentMethodId } });
      }
      await stripe.subscriptions.update(sub.id, { default_payment_method: paymentMethodId });
    }
  }
  await stripe.customers.update(customer, { invoice_settings: { default_payment_method: paymentMethodId } });
}
