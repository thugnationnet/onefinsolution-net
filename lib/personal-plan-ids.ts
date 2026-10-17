import 'server-only';
import { lookupKey, plans } from '@/lib/plans';

export type PersonalPlanIds = {
  accountId?: string;
  mode?: string;
  prices: Record<string, string>;
  lookups: Record<string, string>;
  site?: string;
};

/**
 * Personal subscription plan identifiers for the dashboard.
 *
 * Production builds must not depend on gitignored provision artifacts.
 * Lookup keys are stable (onefin_v2_*) and resolve against Stripe at runtime
 * when a price id map is not available.
 */
export function loadPersonalPlanIds(): PersonalPlanIds {
  const lookups: Record<string, string> = {};
  for (const plan of plans) {
    if (plan.key === 'custom') continue;
    lookups[plan.key] = lookupKey(plan.key);
  }

  // Optional runtime override via env JSON: {"daily":"price_...","weekly":"price_...",...}
  let prices: Record<string, string> = {};
  const raw = process.env.STRIPE_PERSONAL_PLAN_PRICE_IDS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === 'object') prices = parsed;
    } catch {
      /* ignore invalid override */
    }
  }

  return {
    mode: process.env.STRIPE_MODE || 'live',
    prices,
    lookups,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  };
}

export function planKeyForPriceId(
  priceId: string,
  ids: PersonalPlanIds = loadPersonalPlanIds(),
): string | null {
  const hit = Object.entries(ids.prices).find(([, id]) => id === priceId)?.[0];
  return hit || null;
}
