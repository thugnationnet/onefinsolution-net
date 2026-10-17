import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookupKey, plans } from '@/lib/plans';
import { billingEnvironment } from '@/lib/billing-environment';

export type PersonalPlanIds = {
  accountId?: string;
  mode?: string;
  prices: Record<string, string>;
  lookups: Record<string, string>;
  site?: string;
};

function parsePriceMap(raw: string | undefined): Record<string, string> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.startsWith('price_')) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function loadFileSnapshot(): PersonalPlanIds | null {
  try {
    const path = join(process.cwd(), 'billing', 'personal-plan-ids.json');
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as PersonalPlanIds;
    if (!parsed?.prices || typeof parsed.prices !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolve personal subscription Stripe price IDs.
 * Prefer env STRIPE_PERSONAL_PLAN_PRICE_IDS (Railway live), then billing snapshot file.
 */
/** @deprecated Prefer personalPlanIds — kept for existing imports. */
export function loadPersonalPlanIds(): PersonalPlanIds {
  return personalPlanIds();
}

export function personalPlanIds(): PersonalPlanIds {
  const mode = billingEnvironment();
  const fromEnv =
    parsePriceMap(process.env.STRIPE_PERSONAL_PLAN_PRICE_IDS) ||
    parsePriceMap(process.env.STRIPE_PERSONAL_PRICE_IDS);

  const file = loadFileSnapshot();
  const prices: Record<string, string> = {
    ...(file?.mode === mode ? file.prices : {}),
    ...(fromEnv || {}),
  };

  // Ensure every plan key has a lookup even if price id missing (catalog code uses lookup as fallback)
  const lookups: Record<string, string> = {};
  for (const plan of plans) {
    lookups[plan.key] = lookupKey(plan.key);
    if (!prices[plan.key] && file?.prices?.[plan.key] && (!file.mode || file.mode === mode)) {
      prices[plan.key] = file.prices[plan.key];
    }
  }

  return {
    accountId:
      process.env.STRIPE_EXPECTED_ACCOUNT_ID || file?.accountId || undefined,
    mode,
    prices,
    lookups: { ...(file?.lookups || {}), ...lookups },
    site: process.env.NEXT_PUBLIC_SITE_URL || file?.site,
  };
}

export function personalPriceId(planKey: string): string | null {
  const ids = personalPlanIds();
  return ids.prices[planKey] || null;
}

export function planKeyForPriceId(priceId: string): string | null {
  const ids = personalPlanIds();
  const hit = Object.entries(ids.prices).find(([, id]) => id === priceId)?.[0];
  return hit || null;
}
