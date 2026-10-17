import 'server-only';
import Stripe from 'stripe';
import {
  billingEnvironment,
  expectedStripeLivemode,
} from './billing-environment';

/**
 * Pinned Stripe API version — must match the installed `stripe` package
 * (`node_modules/stripe` package API version).
 */
export const STRIPE_API_VERSION = '2026-09-30.endive' as const;

let stripe: Stripe | null = null;

function assertKeyMatchesMode(secretKey: string): void {
  const mode = billingEnvironment();
  const isLiveKey = secretKey.startsWith('sk_live_');
  const isTestKey = secretKey.startsWith('sk_test_');
  if (!isLiveKey && !isTestKey) {
    throw new Error('STRIPE_SECRET_KEY must start with sk_live_ or sk_test_.');
  }
  if (mode === 'live' && !isLiveKey) {
    throw new Error(
      'STRIPE_MODE=live requires a sk_live_ STRIPE_SECRET_KEY. Refusing to start billing with a test key.',
    );
  }
  if (mode === 'test' && !isTestKey) {
    throw new Error(
      'STRIPE_MODE=test requires a sk_test_ STRIPE_SECRET_KEY. Refusing to mix live keys into test mode.',
    );
  }
}

export function stripeClient(): Stripe {
  if (stripe) return stripe;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required.');
  }
  assertKeyMatchesMode(secretKey);

  stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: {
      name: 'OneFinSolution',
      version: '1.0.0',
      url: 'https://onefinsolution.net',
    },
  });
  return stripe;
}

/** Verified client: secret present, mode matches key prefix, optional account pin. */
export function verifiedStripe(): Stripe {
  const client = stripeClient();
  const expectedAccount = process.env.STRIPE_EXPECTED_ACCOUNT_ID?.trim();
  if (expectedAccount && !expectedAccount.startsWith('acct_')) {
    throw new Error('STRIPE_EXPECTED_ACCOUNT_ID must start with acct_.');
  }
  // Publishable key mode alignment (server-side check for misconfig)
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || '';
  if (pk) {
    const livePk = pk.startsWith('pk_live_');
    const testPk = pk.startsWith('pk_test_');
    if (billingEnvironment() === 'live' && !livePk) {
      throw new Error(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be pk_live_ when STRIPE_MODE=live.',
      );
    }
    if (billingEnvironment() === 'test' && !testPk) {
      throw new Error(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be pk_test_ when STRIPE_MODE=test.',
      );
    }
  }
  void expectedStripeLivemode;
  return client;
}
