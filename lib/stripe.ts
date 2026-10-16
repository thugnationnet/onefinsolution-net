import 'server-only';
import Stripe from 'stripe';
import { billingEnvironment } from './billing-environment';

/**
 * Pinned Stripe API version — must match the installed `stripe` package
 * (`node_modules/stripe/cjs/apiVersion.js` → ApiVersion).
 * Workbench event destinations may use their own payload version; that is OK.
 */
export const STRIPE_API_VERSION = '2026-09-30.endive' as Stripe.LatestApiVersion;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  const keyMode = key?.match(/^(?:sk|rk)_(test|live)_/)?.[1];
  if (!key || keyMode !== billingEnvironment()) {
    throw new Error(`A Stripe ${billingEnvironment()} mode secret key is required.`);
  }
  const envVersion = process.env.STRIPE_API_VERSION?.trim();
  const apiVersion = (envVersion || STRIPE_API_VERSION) as Stripe.LatestApiVersion;
  return new Stripe(key, {
    apiVersion,
    maxNetworkRetries: 2,
    timeout: 15_000,
    typescript: true,
  });
}

export async function verifiedStripe() {
  const stripe = stripeClient();
  const expected = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
  if (!expected) throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required.');
  // Retrieve platform account (empty id = own account for secret-key auth).
  const account = await stripe.accounts.retrieve(expected);
  if (account.id !== expected) {
    throw new Error('Stripe account mismatch — refusing to use this application.');
  }
  return stripe;
}
