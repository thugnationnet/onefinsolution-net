import 'server-only';
import type Stripe from 'stripe';
import { findPlan, lookupKey, plans } from './plans';
import { stripeObjectMatchesMode } from './billing-environment';
export async function approvedPrice(stripe: Stripe, key: string) {
  const plan = findPlan(key);
  // Custom is schema-supported for ops/manual billing only — never self-serve Stripe Checkout.
  if (plan.key === 'custom') {
    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');
  }
  const result = await stripe.prices.list({ lookup_keys: [lookupKey(key)], active: true, limit: 2 });
  const price = result.data[0];
  if (result.data.length !== 1 || !stripeObjectMatchesMode(price.livemode) || price.currency !== 'usd' || price.unit_amount !== plan.amount || price.recurring?.interval !== plan.interval || price.recurring.interval_count !== 1 || price.metadata.app !== 'chatbot-template') throw new Error('This plan is not configured yet. Please contact support.');
  return price;
}
export function managedPlan(price: Stripe.Price) {
  return plans.find(plan => price.lookup_key === lookupKey(plan.key) && price.currency === 'usd' && price.unit_amount === plan.amount && price.recurring?.interval === plan.interval && price.recurring.interval_count === 1 && stripeObjectMatchesMode(price.livemode) && price.metadata.app === 'chatbot-template');
}
