import 'server-only';
import Stripe from 'stripe';
import { billingEnvironment, expectedStripeLivemode } from './billing-environment';

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  const keyMode = key?.match(/^(?:sk|rk)_(test|live)_/)?.[1];
  if (!key || keyMode !== billingEnvironment()) throw new Error(`A Stripe ${billingEnvironment()} mode secret key is required.`);
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}
export async function verifiedStripe() {
  const stripe = stripeClient();
  const expected = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
  if (!expected) throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required.');
  const [account, balance] = await Promise.all([stripe.accounts.retrieve(expected), stripe.balance.retrieve()]);
  if (account.id !== expected || balance.livemode !== expectedStripeLivemode()) throw new Error('Stripe account or mode does not match this application.');
  return stripe;
}
