import 'server-only';
import type Stripe from 'stripe';

/**
 * Multi-currency presentment for a Thailand Stripe account that settles in THB
 * while catalog baselines remain USD.
 *
 * Rules:
 * - Supported presentment currencies: usd, thb
 * - Default presentment = Stripe account default_currency (thb for this account)
 *   unless STRIPE_PRESENTMENT_CURRENCY overrides it
 * - Catalog / plan amounts are defined in USD minor units; THB amounts are derived
 *   via STRIPE_USD_THB_RATE (THB per 1 USD)
 * - Never reject a valid payment solely because presentment ≠ usd
 */

export type BillingCurrency = 'usd' | 'thb';

const SUPPORTED = new Set<BillingCurrency>(['usd', 'thb']);

/** Fallback FX if env not set — ops should set STRIPE_USD_THB_RATE in Railway. */
const DEFAULT_USD_THB_RATE = 36;

let cachedAccountCurrency: BillingCurrency | null = null;

export function isBillingCurrency(value: string | null | undefined): value is BillingCurrency {
  return !!value && SUPPORTED.has(value.toLowerCase() as BillingCurrency);
}

export function normalizeBillingCurrency(value: string | null | undefined): BillingCurrency | null {
  if (!value) return null;
  const c = value.trim().toLowerCase();
  return isBillingCurrency(c) ? c : null;
}

/** THB per 1 USD (e.g. 36 means $1 → ฿36). */
export function usdToThbRate(): number {
  const raw = process.env.STRIPE_USD_THB_RATE?.trim();
  if (!raw) return DEFAULT_USD_THB_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 200) {
    throw new Error('STRIPE_USD_THB_RATE must be a positive number (THB per 1 USD).');
  }
  return n;
}

/**
 * Convert a USD minor-unit amount into the presentment currency minor units.
 * Both USD and THB use 2-decimal minor units in Stripe.
 */
export function convertUsdCentsToCurrency(usdCents: number, currency: BillingCurrency): number {
  if (!Number.isFinite(usdCents) || usdCents < 0) {
    throw new Error('Amount must be a non-negative number of USD cents.');
  }
  if (currency === 'usd') return Math.round(usdCents);
  // THB satang = USD cents * (THB per USD)
  return Math.round(usdCents * usdToThbRate());
}

export function convertCurrencyToUsdCents(amountMinor: number, currency: BillingCurrency): number {
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    throw new Error('Amount must be a non-negative minor-unit value.');
  }
  if (currency === 'usd') return Math.round(amountMinor);
  return Math.round(amountMinor / usdToThbRate());
}

/**
 * Resolve presentment currency for a new charge.
 * Priority: explicit override → env STRIPE_PRESENTMENT_CURRENCY → account default → usd.
 */
export async function resolvePresentmentCurrency(
  stripe: Stripe,
  opts?: {
    preferred?: string | null;
    customerCurrency?: string | null;
    paymentMethodCountry?: string | null;
  },
): Promise<BillingCurrency> {
  const preferred = normalizeBillingCurrency(opts?.preferred);
  if (preferred) return preferred;

  const env = normalizeBillingCurrency(process.env.STRIPE_PRESENTMENT_CURRENCY);
  if (env) return env;

  // Thai-issued cards prefer THB presentment when account supports it.
  const country = (opts?.paymentMethodCountry || '').toUpperCase();
  if (country === 'TH') return 'thb';

  const customerCur = normalizeBillingCurrency(opts?.customerCurrency);
  if (customerCur) return customerCur;

  const accountDefault = await accountDefaultCurrency(stripe);
  return accountDefault;
}

export async function accountDefaultCurrency(stripe: Stripe): Promise<BillingCurrency> {
  if (cachedAccountCurrency) return cachedAccountCurrency;
  try {
    const expected = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
    const accountId = expected || process.env.STRIPE_EXPECTED_ACCOUNT_ID;
    if (!accountId) throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required to resolve presentment currency.');
    const account = await stripe.accounts.retrieve(accountId);
    const cur = normalizeBillingCurrency(account.default_currency);
    cachedAccountCurrency = cur || 'usd';
  } catch {
    cachedAccountCurrency = normalizeBillingCurrency(process.env.STRIPE_PRESENTMENT_CURRENCY) || 'usd';
  }
  return cachedAccountCurrency;
}

/** Lookup key helpers: base key for USD, `${base}_thb` for THB. */
export function priceLookupKeyForCurrency(baseLookupKey: string, currency: BillingCurrency): string {
  if (currency === 'usd') return baseLookupKey;
  if (baseLookupKey.endsWith(`_${currency}`)) return baseLookupKey;
  return `${baseLookupKey}_${currency}`;
}

export function currencySymbol(currency: BillingCurrency): string {
  return currency === 'thb' ? '฿' : '$';
}

export function formatMoney(amountMinor: number, currency: BillingCurrency): string {
  const major = (amountMinor / 100).toLocaleString(currency === 'thb' ? 'th-TH' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'thb' ? `฿${major}` : `$${major} USD`;
}

/**
 * Amount match with small tolerance for FX rounding (max 1 minor unit or 0.5%).
 */
export function amountsMatch(
  expectedMinor: number,
  actualMinor: number,
  opts?: { toleranceMinor?: number },
): boolean {
  const tol = opts?.toleranceMinor ?? 1;
  return Math.abs(expectedMinor - actualMinor) <= tol;
}

/**
 * Map Stripe / card errors into customer-friendly copy.
 * Currency problems must not be framed as a permanently bad card.
 */
export function friendlyPaymentError(error: unknown): string {
  const e = error as {
    type?: string;
    code?: string;
    decline_code?: string;
    message?: string;
    raw?: { code?: string; decline_code?: string; message?: string };
  };
  const code = (e?.code || e?.raw?.code || '').toLowerCase();
  const decline = (e?.decline_code || e?.raw?.decline_code || '').toLowerCase();
  const message = (e?.message || e?.raw?.message || '').toLowerCase();

  if (
    code === 'currency_not_supported' ||
    decline === 'currency_not_supported' ||
    message.includes('currency') && (message.includes('not support') || message.includes('unsupported'))
  ) {
    return 'This card could not be charged in the selected currency. Try again — we will use a local currency (THB) when possible — or use another card.';
  }

  if (code === 'card_declined' || decline) {
    if (decline === 'currency_not_supported') {
      return 'Your bank declined this charge due to currency. Please retry; local-currency (THB) presentment is preferred for Thai cards.';
    }
    if (decline === 'insufficient_funds') {
      return 'Your card was declined due to insufficient funds. Please try another card or add funds and retry.';
    }
    if (decline === 'lost_card' || decline === 'stolen_card') {
      return 'Your card was declined by the bank. Please use a different card.';
    }
    if (decline === 'do_not_honor' || decline === 'generic_decline') {
      return 'Your bank declined this payment. This is often temporary or currency-related — try again, or use another card. It does not mean the card is permanently invalid.';
    }
    return 'Your card was declined by the bank. You can retry or use another card — a decline is not always permanent.';
  }

  if (code === 'expired_card') return 'This card has expired. Please use a different card.';
  if (code === 'incorrect_cvc' || code === 'invalid_cvc') return 'The CVC/CVV code is incorrect. Please check and try again.';
  if (code === 'processing_error') return 'The bank had a temporary processing error. Please try again in a moment.';

  if (typeof e?.message === 'string' && e.message.trim()) {
    // Avoid leaking internal Stripe jargon when possible
    if (message.includes('currency')) {
      return 'Payment could not be completed due to a currency mismatch. Please retry — Thai cards are charged in THB when available.';
    }
    return e.message;
  }

  return 'Payment could not be completed. Please try again or use a different card.';
}

/** Clear cached account currency (tests / after account change). */
export function resetBillingCurrencyCache() {
  cachedAccountCurrency = null;
}
