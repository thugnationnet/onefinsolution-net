import 'server-only';
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
