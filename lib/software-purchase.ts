import { softwareCatalog } from '@/app/software/src/data/catalog';
import { STOREFRONT_TEMPLATES } from '@/app/software/src/data/templatesData';

export type SoftwarePurchaseKind = 'template' | 'software';

/** Payment status only — never conflated with inquiry/project status. */
export type SoftwarePaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'failed';

export type SoftwarePaymentAttemptStatus = 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';

export interface SoftwarePurchaseItem {
  kind: SoftwarePurchaseKind;
  id: string;
  name: string;
  /** Default agreed project price (catalog). */
  priceCents: number;
  /** Configurable estimate band (min–max). Defaults to catalog price when no band exists. */
  estimatedMinCents: number;
  estimatedMaxCents: number;
  /** Optional Stripe Dashboard correlation (from STRIPE_SOFTWARE_CATALOG). Not used for PI amount. */
  stripeProductId?: string;
  stripePriceId?: string;
  stripeProductLookupKey?: string;
}

export interface SoftwarePurchaseTotals {
  /** Agreed project price — drives accounting. */
  agreedPriceCents: number;
  /** Sum of successfully verified payments only. */
  amountPaidCents: number;
}

type SoftwareStripeCatalogEntry = {
  productId?: string;
  priceId?: string;
  priceUsd?: number;
  kind?: string;
  lookup?: string;
};

let cachedSoftwareStripeCatalog: Record<string, SoftwareStripeCatalogEntry> | null | undefined;

/** Optional map from env STRIPE_SOFTWARE_CATALOG (provisioned via npm run stripe:provision-software). */
export function getSoftwareStripeCatalogMap(): Record<string, SoftwareStripeCatalogEntry> {
  if (cachedSoftwareStripeCatalog !== undefined) {
    return cachedSoftwareStripeCatalog ?? {};
  }
  const raw = process.env.STRIPE_SOFTWARE_CATALOG?.trim();
  if (!raw) {
    cachedSoftwareStripeCatalog = null;
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, SoftwareStripeCatalogEntry>;
    cachedSoftwareStripeCatalog = parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    cachedSoftwareStripeCatalog = null;
  }
  return cachedSoftwareStripeCatalog ?? {};
}

function stripeIdsFor(
  kind: SoftwarePurchaseKind,
  id: string,
): Pick<SoftwarePurchaseItem, 'stripeProductId' | 'stripePriceId' | 'stripeProductLookupKey'> {
  const entry = getSoftwareStripeCatalogMap()[`${kind}:${id}`];
  if (!entry) return {};
  return {
    stripeProductId: typeof entry.productId === 'string' ? entry.productId : undefined,
    stripePriceId: typeof entry.priceId === 'string' ? entry.priceId : undefined,
    stripeProductLookupKey: typeof entry.lookup === 'string' ? entry.lookup : undefined,
  };
}

export function getSoftwarePurchaseItem(
  kind: string | undefined,
  id: string | undefined,
): SoftwarePurchaseItem | null {
  if (!id || (kind !== 'template' && kind !== 'software')) return null;

  if (kind === 'template') {
    const template = STOREFRONT_TEMPLATES.find((item) => item.id === id);
    if (!template) return null;
    const priceCents = Math.round(Number(template.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
    return {
      kind,
      id: template.id,
      name: template.name,
      priceCents,
      estimatedMinCents: priceCents,
      estimatedMaxCents: priceCents,
      ...stripeIdsFor(kind, template.id),
    };
  }

  const product = softwareCatalog.find((item) => item.id === id);
  if (!product) return null;
  // Software catalog uses priceUsd (USD). Avoid unsafe casts that fail under
  // strict TS when SoftwareProduct has no `price` field.
  const priceUsd =
    typeof product.priceUsd === 'number' ? product.priceUsd : Number.NaN;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const priceCents = Math.round(priceUsd * 100);
  return {
    kind,
    id: product.id,
    name: product.name,
    priceCents,
    estimatedMinCents: priceCents,
    estimatedMaxCents: priceCents,
    ...stripeIdsFor(kind, product.id),
  };
}

/**
 * Flexible installment / deposit amount.
 * Allows configured minimum (floor), custom amount, or full agreed price up to maxCents.
 */
export function parseSoftwarePaymentAmount(
  value: string,
  maximumCents: number,
  minimumCents = 500,
): number | null {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ''] = value.split('.');
  const amountCents = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountCents)) return null;
  if (amountCents < minimumCents || amountCents > maximumCents) return null;
  return amountCents;
}

/** Remaining balance never goes negative; only successful payments reduce it. */
export function remainingBalanceCents(totals: SoftwarePurchaseTotals): number {
  return Math.max(0, totals.agreedPriceCents - Math.max(0, totals.amountPaidCents));
}

export function isFullyPaid(totals: SoftwarePurchaseTotals): boolean {
  return totals.agreedPriceCents > 0 && remainingBalanceCents(totals) === 0;
}

/**
 * Derive payment status from agreed price + successful totals.
 * A deposit alone never yields `paid` unless remaining is zero.
 */
export function paymentStatusFromTotals(
  totals: SoftwarePurchaseTotals,
  fallback: SoftwarePaymentStatus = 'pending',
): SoftwarePaymentStatus {
  const paid = Math.max(0, totals.amountPaidCents);
  const agreed = Math.max(0, totals.agreedPriceCents);

  if (agreed <= 0) return fallback;
  if (paid <= 0) return fallback === 'failed' ? 'failed' : 'pending';
  if (paid >= agreed) return 'paid';
  return 'partially_paid';
}

/**
 * Recompute purchase payment fields after a ledger change.
 * `successfulPaymentCents` must be the sum of succeeded rows only.
 */
export function recomputePurchasePaymentFields(input: {
  agreedPriceCents: number;
  successfulPaymentCents: number;
  previousStatus?: SoftwarePaymentStatus;
}): {
  amountPaidCents: number;
  remainingCents: number;
  status: SoftwarePaymentStatus;
  fullyPaid: boolean;
  paidAt: 'set' | 'clear' | 'keep';
} {
  const agreedPriceCents = Math.max(0, input.agreedPriceCents);
  const amountPaidCents = Math.max(0, input.successfulPaymentCents);
  const remainingCents = remainingBalanceCents({
    agreedPriceCents,
    amountPaidCents,
  });
  const fullyPaid = isFullyPaid({ agreedPriceCents, amountPaidCents });
  const previous = input.previousStatus || 'pending';

  let status: SoftwarePaymentStatus;
  if (fullyPaid) status = 'paid';
  else if (amountPaidCents > 0) status = 'partially_paid';
  else if (previous === 'failed') status = 'failed';
  else status = 'pending';

  return {
    amountPaidCents,
    remainingCents,
    status,
    fullyPaid,
    paidAt: fullyPaid ? 'set' : amountPaidCents > 0 ? 'clear' : previous === 'paid' ? 'clear' : 'keep',
  };
}

/** Max chargeable now = remaining balance (installments cannot exceed outstanding). */
export function maxPayableCents(totals: SoftwarePurchaseTotals): number {
  return remainingBalanceCents(totals);
}

export function assertPositiveAgreedPrice(agreedPriceCents: number): void {
  if (!Number.isSafeInteger(agreedPriceCents) || agreedPriceCents <= 0) {
    throw new Error('Agreed project price must be a positive amount.');
  }
}
