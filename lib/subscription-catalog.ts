import 'server-only';
import type Stripe from 'stripe';
import { findPlan, lookupKey, plans } from './plans';
import { stripeObjectMatchesMode } from './billing-environment';
import {
  type BillingCurrency,
  convertUsdCentsToCurrency,
  normalizeBillingCurrency,
  priceLookupKeyForCurrency,
  resolvePresentmentCurrency,
} from './billing-currency';

/**
 * Resolve a managed subscription Price for the requested presentment currency.
 * - USD: lookup `onefin_v2_{plan}` (baseline catalog)
 * - THB: lookup `onefin_v2_{plan}_thb` (sibling price on same product)
 *
 * Falls back to creating a THB sibling from the USD baseline when missing so
 * Thai debit cards are not declined purely for currency mismatch.
 */
export async function approvedPrice(
  stripe: Stripe,
  key: string,
  preferredCurrency?: string | null,
): Promise<Stripe.Price> {
  const plan = findPlan(key);
  // Custom is schema-supported for ops/manual billing only — never self-serve Stripe Checkout.
  if (plan.key === 'custom') {
    throw new Error('Custom plans are arranged with our team. Choose a standard plan or contact support.');
  }

  const currency = preferredCurrency
    ? (normalizeBillingCurrency(preferredCurrency) || (await resolvePresentmentCurrency(stripe)))
    : await resolvePresentmentCurrency(stripe);

  const baseKey = lookupKey(key);
  const keyForCurrency = priceLookupKeyForCurrency(baseKey, currency);

  const listed = await stripe.prices.list({ lookup_keys: [keyForCurrency], active: true, limit: 2 });
  let price = listed.data[0];

  if (!price && currency !== 'usd') {
    // Ensure USD baseline exists, then create/find THB sibling.
    const usdListed = await stripe.prices.list({ lookup_keys: [baseKey], active: true, limit: 2 });
    const usdPrice = usdListed.data[0];
    if (
      !usdPrice ||
      usdListed.data.length !== 1 ||
      !stripeObjectMatchesMode(usdPrice.livemode) ||
      usdPrice.currency !== 'usd' ||
      usdPrice.unit_amount !== plan.amount ||
      usdPrice.recurring?.interval !== plan.interval ||
      (usdPrice.recurring?.interval_count ?? 1) !== 1 ||
      usdPrice.metadata?.app !== 'chatbot-template'
    ) {
      throw new Error('This plan is not configured yet. Please contact support.');
    }
    price = await ensureSiblingCurrencyPrice(stripe, usdPrice, currency, keyForCurrency, {
      app: 'chatbot-template',
      billing_scope: 'subscription',
      plan_key: plan.key,
    });
  }

  if (
    !price ||
    !stripeObjectMatchesMode(price.livemode) ||
    normalizeBillingCurrency(price.currency) !== currency ||
    price.recurring?.interval !== plan.interval ||
    (price.recurring?.interval_count ?? 1) !== 1
  ) {
    throw new Error('This plan is not configured yet. Please contact support.');
  }

  // Amount check: USD exact; THB must match converted baseline (allow 1 satang FX round).
  if (currency === 'usd') {
    if (price.unit_amount !== plan.amount) {
      throw new Error('This plan is not configured yet. Please contact support.');
    }
  } else {
    const expected = convertUsdCentsToCurrency(plan.amount, currency);
    if (Math.abs((price.unit_amount || 0) - expected) > 1) {
      throw new Error('This plan is not configured yet. Please contact support.');
    }
  }

  return price;
}

async function ensureSiblingCurrencyPrice(
  stripe: Stripe,
  sourcePrice: Stripe.Price,
  currency: BillingCurrency,
  lookup: string,
  metadata: Record<string, string>,
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0];

  if (!sourcePrice.unit_amount || sourcePrice.currency !== 'usd') {
    throw new Error('Multi-currency prices must be derived from a USD baseline.');
  }

  const productId =
    typeof sourcePrice.product === 'string' ? sourcePrice.product : sourcePrice.product.id;

  return stripe.prices.create({
    product: productId,
    currency,
    unit_amount: convertUsdCentsToCurrency(sourcePrice.unit_amount, currency),
    lookup_key: lookup,
    transfer_lookup_key: true,
    nickname: `${sourcePrice.nickname || lookup} (${currency.toUpperCase()})`,
    recurring: sourcePrice.recurring
      ? {
          interval: sourcePrice.recurring.interval,
          interval_count: sourcePrice.recurring.interval_count || 1,
        }
      : undefined,
    metadata: {
      ...sourcePrice.metadata,
      ...metadata,
      baseline_price_id: sourcePrice.id,
      baseline_currency: 'usd',
      presentment_currency: currency,
    },
  });
}

export function managedPlan(price: Stripe.Price) {
  const lk = price.lookup_key || '';
  return plans.find((plan) => {
    const base = lookupKey(plan.key);
    const matchesKey = lk === base || lk === `${base}_thb` || lk === `${base}_usd`;
    if (!matchesKey) return false;
    if (!stripeObjectMatchesMode(price.livemode)) return false;
    if (price.recurring?.interval !== plan.interval) return false;
    if ((price.recurring?.interval_count ?? 1) !== 1) return false;
    // metadata app check when present
    if (price.metadata?.app && price.metadata.app !== 'chatbot-template') return false;
    if (price.currency === 'usd') return price.unit_amount === plan.amount;
    if (price.currency === 'thb') {
      const expected = convertUsdCentsToCurrency(plan.amount, 'thb');
      return Math.abs((price.unit_amount || 0) - expected) <= 1;
    }
    return false;
  });
}
