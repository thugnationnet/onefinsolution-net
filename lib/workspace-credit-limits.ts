/**
 * Shared Workspace credit purchase limits (safe for client + server).
 * $1 USD = 10 credits (matches historical $5 → 50 credits pack).
 */

export const WORKSPACE_CREDIT_MIN_AMOUNT_CENTS = 500; // $5
export const WORKSPACE_CREDIT_MAX_AMOUNT_CENTS = 50_000; // $500
export const WORKSPACE_CREDITS_PER_USD = 10;
export const WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS = 500; // $5 default pack

export const WORKSPACE_CREDIT_AMOUNT_PRESETS_USD = [
  5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500,
] as const;

export function creditsFromAmountCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.floor(amountCents / 10);
}

export function assertWorkspaceCreditAmountCents(amountCents: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new Error('Amount must be a whole number of cents.');
  }
  if (amountCents < WORKSPACE_CREDIT_MIN_AMOUNT_CENTS) {
    throw new Error(
      `Minimum workspace credit purchase is $${(WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100).toFixed(0)}.`,
    );
  }
  if (amountCents > WORKSPACE_CREDIT_MAX_AMOUNT_CENTS) {
    throw new Error(
      `Maximum workspace credit purchase is $${(WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100).toFixed(0)} per transaction.`,
    );
  }
  return amountCents;
}

export function resolveWorkspaceCreditAmountCents(input?: {
  amountUsd?: number | string | null;
  amountCents?: number | string | null;
  allowDefault?: boolean;
}): number {
  const allowDefault = input?.allowDefault !== false;
  let amountCents: number | null = null;

  if (input?.amountCents != null && String(input.amountCents).trim() !== '') {
    const raw = Number(input.amountCents);
    if (!Number.isFinite(raw)) throw new Error('Enter a valid amount.');
    amountCents = Math.round(raw);
  } else if (input?.amountUsd != null && String(input.amountUsd).trim() !== '') {
    const raw = Number(input.amountUsd);
    if (!Number.isFinite(raw)) throw new Error('Enter a valid amount in USD.');
    amountCents = Math.round(raw * 100);
  } else if (allowDefault) {
    amountCents = WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS;
  } else {
    throw new Error(
      `Enter an amount between $${(WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100).toFixed(0)} and $${(WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100).toFixed(0)}.`,
    );
  }

  return assertWorkspaceCreditAmountCents(amountCents);
}

export function formatWorkspaceCreditUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
}
