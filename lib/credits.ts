import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from './db';
import { signupCredits, workspaceCreditCost } from './credit-config';
import { maybeAttemptWorkspaceAutoReload } from './workspace-auto-reload';

export async function ensureSignupCredits(userId: string) {
  try {
    const amount = signupCredits();
    if (!amount) return;
    const existing = await query<{ user_id?: string }>(
      'select user_id from credit_buckets where reference=$1',
      [`signup:${userId}`],
    );
    if (existing[0]?.user_id === userId) return;
    await query('select grant_credits($1,$2,$3)', [userId, `signup:${userId}`, amount]);
  } catch {
    /* Signup credit grant is best-effort and must never block auth/dashboard. */
  }
}

export async function reserveWorkspaceCredits(userId: string) {
  const id = randomUUID();
  const cost = workspaceCreditCost();
  await query('select reserve_credits($1,$2,$3)', [userId, id, cost]);
  return id;
}

export async function finishWorkspaceCredits(userId: string, id: string, success: boolean) {
  await query('select finish_credit_usage($1,$2,$3)', [userId, id, success]);
  // Best-effort auto-reload when balance may have dropped below threshold.
  void maybeAttemptWorkspaceAutoReload(userId).catch(() => undefined);
}
