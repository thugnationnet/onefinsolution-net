import 'server-only';
import type Stripe from 'stripe';
import {
  WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  WORKSPACE_CREDITS_PER_USD,
  assertWorkspaceCreditAmountCents,
  creditsFromAmountCents,
  formatWorkspaceCreditUsd,
  resolveWorkspaceCreditAmountCents,
} from './workspace-credit-limits';
import {
  type BillingCurrency,
  convertUsdCentsToCurrency,
  formatMoney,
  normalizeBillingCurrency,
  priceLookupKeyForCurrency,
  resolvePresentmentCurrency,
} from './billing-currency';

export {
  WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  WORKSPACE_CREDITS_PER_USD,
  assertWorkspaceCreditAmountCents,
  creditsFromAmountCents,
  formatWorkspaceCreditUsd,
};

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export type WorkspaceCreditPack = {
  id: string;
  productId: string;
  priceId: string;
  amount: number;
  currency: 'usd';
  credits: number;
};

/**
 * Default catalog pack ($5 / 50 credits). Resolved lazily so Next.js build
 * page-data collection does not require Stripe env vars at import time.
 */
function loadWorkspaceCreditPack(): WorkspaceCreditPack {
  return {
    id: 'workspace_credits_50',
    productId: required('STRIPE_PRODUCT_CREDITS_50', process.env.STRIPE_PRODUCT_CREDITS_50),
    priceId: required('STRIPE_PRICE_CREDITS_50', process.env.STRIPE_PRICE_CREDITS_50),
    amount: WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
    currency: 'usd',
    credits: creditsFromAmountCents(WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS),
  };
}

let cachedPack: WorkspaceCreditPack | null = null;

export function getWorkspaceCreditPack(): WorkspaceCreditPack {
  if (!cachedPack) cachedPack = loadWorkspaceCreditPack();
  return cachedPack;
}

/** @deprecated Prefer getWorkspaceCreditPack() for lazy env resolution. */
export const workspaceCreditPack: WorkspaceCreditPack = new Proxy({} as WorkspaceCreditPack, {
  get(_target, prop, receiver) {
    return Reflect.get(getWorkspaceCreditPack(), prop, receiver);
  },
});

export type WorkspaceCreditQuote = {
  amountCents: number;
  amountUsd: number;
  credits: number;
  currency: 'usd';
  isDefaultPack: boolean;
  packId: string;
};

export function resolveWorkspaceCreditQuote(input?: {
  amountUsd?: number | string | null;
  amountCents?: number | string | null;
  allowDefault?: boolean;
}): WorkspaceCreditQuote {
  const amountCents = resolveWorkspaceCreditAmountCents(input);
  const credits = creditsFromAmountCents(amountCents);
  if (credits <= 0) throw new Error('Amount is too small to purchase credits.');
  const pack = getWorkspaceCreditPack();
  const isDefaultPack = amountCents === pack.amount && credits === pack.credits;

  return {
    amountCents,
    amountUsd: amountCents / 100,
    credits,
    currency: 'usd',
    isDefaultPack,
    packId: isDefaultPack ? pack.id : `workspace_credits_custom_${amountCents}`,
  };
}

export type WorkspaceCreditPresentmentQuote = WorkspaceCreditQuote & {
  /** Presentment minor units actually charged on the PaymentIntent. */
  presentmentAmountCents: number;
  presentmentCurrency: BillingCurrency;
  /** USD baseline kept for credits math / DB. */
  usdAmountCents: number;
  priceId?: string;
  label: string;
};

/**
 * Adaptive presentment for Workspace credit charges.
 * Credits always derive from USD baseline; PI currency follows account/card.
 */
export async function resolveWorkspaceCreditPresentment(
  stripe: Stripe,
  input?: {
    amountUsd?: number | string | null;
    amountCents?: number | string | null;
    allowDefault?: boolean;
    preferredCurrency?: string | null;
    paymentMethodCountry?: string | null;
  },
): Promise<WorkspaceCreditPresentmentQuote> {
  const base = resolveWorkspaceCreditQuote(input);
  const presentmentCurrency = await resolvePresentmentCurrency(stripe, {
    preferred: input?.preferredCurrency,
    paymentMethodCountry: input?.paymentMethodCountry,
  });
  const presentmentAmountCents = convertUsdCentsToCurrency(base.amountCents, presentmentCurrency);

  let priceId: string | undefined;
  if (base.isDefaultPack) {
    const baseLookup = 'onefin_credits_50';
    const lookup = priceLookupKeyForCurrency(baseLookup, presentmentCurrency);
    try {
      const listed = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
      if (listed.data[0]) {
        priceId = listed.data[0].id;
      } else if (presentmentCurrency !== 'usd') {
        const usdListed = await stripe.prices.list({
          lookup_keys: [baseLookup],
          active: true,
          limit: 1,
        });
        const usdPrice = usdListed.data[0];
        if (usdPrice?.currency === 'usd' && usdPrice.unit_amount === base.amountCents) {
          const productId =
            typeof usdPrice.product === 'string' ? usdPrice.product : usdPrice.product.id;
          const created = await stripe.prices.create({
            product: productId,
            currency: presentmentCurrency,
            unit_amount: presentmentAmountCents,
            lookup_key: lookup,
            transfer_lookup_key: true,
            nickname: `Workspace 50 credits (${presentmentCurrency.toUpperCase()})`,
            metadata: {
              app: 'chatbot-template',
              billing_scope: 'workspace',
              kind: 'pack',
              credits: String(base.credits),
              baseline_price_id: usdPrice.id,
              baseline_currency: 'usd',
              presentment_currency: presentmentCurrency,
            },
          });
          priceId = created.id;
        }
      }
    } catch {
      /* amount-only PI is acceptable */
    }
  }

  return {
    ...base,
    presentmentAmountCents,
    presentmentCurrency,
    usdAmountCents: base.amountCents,
    priceId,
    label: formatMoney(presentmentAmountCents, presentmentCurrency),
  };
}

export { formatMoney, convertUsdCentsToCurrency, normalizeBillingCurrency };
