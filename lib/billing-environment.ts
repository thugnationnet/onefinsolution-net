export type StripeMode = 'test' | 'live';

export function billingEnvironment(): StripeMode {
  const mode = process.env.STRIPE_MODE || 'test';
  if (mode !== 'test' && mode !== 'live') throw new Error('STRIPE_MODE must be test or live.');
  return mode;
}

export function expectedStripeLivemode(): boolean {
  return billingEnvironment() === 'live';
}

export function stripeObjectMatchesMode(livemode: boolean): boolean {
  return livemode === expectedStripeLivemode();
}
