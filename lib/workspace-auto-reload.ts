import 'server-only';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { query, transaction } from '@/lib/db';
import { verifiedStripe } from '@/lib/stripe';
import { workspaceCustomer } from '@/lib/workspace-stripe';
import {
  workspaceCreditPack,
  resolveWorkspaceCreditQuote,
  formatWorkspaceCreditUsd,
} from '@/lib/workspace-credit-pack';
import { requireOwnedPaymentMethod } from '@/lib/billing-scope';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import { fulfillStripeEvent } from '@/lib/stripe-fulfillment';

const COOLDOWN_MS = 2 * 60 * 1000;
const PENDING_STALE_MS = 15 * 60 * 1000;

export type WorkspaceAutoReloadSettings = {
  enabled: boolean;
  threshold: number;
  /** USD cents charged on each auto-reload ($5-$500). */
  reloadAmountCents: number;
  hasPaymentMethod: boolean;
  lastError: string | null;
  lastAt: string | null;
};

export async function readWorkspaceAutoReloadSettings(
  userId: string,
): Promise<WorkspaceAutoReloadSettings> {
  try {
    const [row] = await query<{
      auto_reload_enabled: boolean | null;
      auto_reload_threshold: number | null;
      payment_method_id: string | null;
      last_auto_reload_error: string | null;
      last_auto_reload_at: string | null;
      reload_amount_cents?: number | null;
    }>(
      `select auto_reload_enabled, auto_reload_threshold, payment_method_id,
              last_auto_reload_error, last_auto_reload_at::text,
              reload_amount_cents
       from workspace_credit_settings where user_id=$1`,
      [userId],
    );

    return {
      enabled: Boolean(row?.auto_reload_enabled),
      threshold: Number.isFinite(Number(row?.auto_reload_threshold))
        ? Number(row?.auto_reload_threshold)
        : 1,
      reloadAmountCents: Number(row?.reload_amount_cents) > 0 ? Number(row?.reload_amount_cents) : workspaceCreditPack.amount,
      hasPaymentMethod: Boolean(row?.payment_method_id),
      lastError: row?.last_auto_reload_error || null,
      lastAt: row?.last_auto_reload_at || null,
    };
  } catch {
    // Migration 015 not applied yet — treat as disabled.
    const [row] = await query<{ payment_method_id: string | null }>(
      'select payment_method_id from workspace_credit_settings where user_id=$1',
      [userId],
    ).catch(() => [null]);
    return {
      enabled: false,
      threshold: 1,
      reloadAmountCents: workspaceCreditPack.amount,
      hasPaymentMethod: Boolean(row?.payment_method_id),
      lastError: null,
      lastAt: null,
    };
  }
}

/**
 * Best-effort low-balance top-up. Never throws to callers (spend path must stay intact).
 * Charges only the Workspace-scoped customer + saved Workspace payment method.
 */
export async function maybeAttemptWorkspaceAutoReload(userId: string): Promise<{
  attempted: boolean;
  charged?: boolean;
  skipped?: string;
  error?: string;
}> {
  try {
    const [balanceRow] = await query<{ balance: string }>(
      'select available_credits($1)::text as balance',
      [userId],
    );
    const balance = Number(balanceRow?.balance || 0);

    let settings: {
      auto_reload_enabled: boolean;
      auto_reload_threshold: number;
      payment_method_id: string | null;
      last_auto_reload_at: Date | string | null;
    } | null = null;

    try {
      const rows = await query<{
        auto_reload_enabled: boolean;
        auto_reload_threshold: number;
        payment_method_id: string | null;
        last_auto_reload_at: Date | string | null;
        reload_amount_cents?: number | null;
      }>(
        `select auto_reload_enabled, auto_reload_threshold, payment_method_id, last_auto_reload_at,
                reload_amount_cents
         from workspace_credit_settings where user_id=$1`,
        [userId],
      );
      settings = rows[0] || null;
    } catch {
      return { attempted: false, skipped: 'migration_pending' };
    }

    if (!settings?.auto_reload_enabled) return { attempted: false, skipped: 'disabled' };
    if (!settings.payment_method_id) return { attempted: false, skipped: 'no_payment_method' };

    const threshold = Number(settings.auto_reload_threshold ?? 1);
    if (!(balance <= threshold)) return { attempted: false, skipped: 'above_threshold' };

    if (settings.last_auto_reload_at) {
      const last = new Date(settings.last_auto_reload_at).getTime();
      if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) {
        return { attempted: false, skipped: 'cooldown' };
      }
    }

    const [pending] = await query<{ id: string; created_at: string }>(
      `select id, created_at::text
       from workspace_credit_purchases
       where user_id=$1 and status='pending'
         and (source = 'auto_reload' or source is null)
       order by created_at desc limit 1`,
      [userId],
    ).catch(async () =>
      query<{ id: string; created_at: string }>(
        `select id, created_at::text
         from workspace_credit_purchases
         where user_id=$1 and status='pending'
         order by created_at desc limit 1`,
        [userId],
      ),
    );

    // Only block on a recent pending auto-reload (not manual checkout drafts).
    if (pending) {
      const age = Date.now() - new Date(pending.created_at).getTime();
      if (Number.isFinite(age) && age < PENDING_STALE_MS) {
        // If source column exists and this is not auto, ignore; otherwise be conservative only under cooldown.
        return { attempted: false, skipped: 'pending_in_flight' };
      }
    }

    const customerId = await workspaceCustomer(userId, false);
    if (!customerId) return { attempted: false, skipped: 'no_customer' };

    const stripe = await verifiedStripe();
    const paymentMethod = await requireOwnedPaymentMethod(
      stripe,
      customerId,
      settings.payment_method_id,
    );

    const reloadQuote = (() => {
      try {
        const cents = Number((settings as { reload_amount_cents?: number | null }).reload_amount_cents);
        return resolveWorkspaceCreditQuote({
          amountCents: Number.isFinite(cents) && cents > 0 ? cents : workspaceCreditPack.amount,
          allowDefault: true,
        });
      } catch {
        return resolveWorkspaceCreditQuote({ allowDefault: true });
      }
    })();
    const purchaseId = randomUUID();
    try {
      await query(
        `insert into workspace_credit_purchases(id,user_id,amount,credits,status,source)
         values ($1,$2,$3,$4,'pending','auto_reload')`,
        [purchaseId, userId, reloadQuote.amountCents, reloadQuote.credits],
      );
    } catch {
      await query(
        `insert into workspace_credit_purchases(id,user_id,amount,credits,status)
         values ($1,$2,$3,$4,'pending')`,
        [purchaseId, userId, reloadQuote.amountCents, reloadQuote.credits],
      );
    }

    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: reloadQuote.amountCents,
          currency: workspaceCreditPack.currency,
          customer: customerId,
          payment_method: paymentMethod.id,
          confirm: true,
          off_session: true,
          // Dashboard/Elements-managed PMs reject error_on_requires_action; status handled below.
          description: `${reloadQuote.credits} One Fin Workspace credits (auto-reload - ${formatWorkspaceCreditUsd(reloadQuote.amountCents)})`,
          metadata: {
            app: 'chatbot-template',
            billing_scope: 'workspace',
            flow: 'workspace-credit-purchase',
            auto_reload: 'true',
            purchase_id: purchaseId,
            user_id: userId,
            pack_id: reloadQuote.packId,
            amount_cents: String(reloadQuote.amountCents),
            credits: String(reloadQuote.credits),
            price_id: reloadQuote.isDefaultPack ? workspaceCreditPack.priceId : '',
          },
        },
        { idempotencyKey: `workspace-auto-reload:${userId}:${purchaseId}` },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-reload charge failed.';
      await markAutoReloadFailure(userId, purchaseId, null, message);
      return { attempted: true, charged: false, error: message };
    }

    await query(
      `update workspace_credit_purchases set stripe_payment_intent=$1
       where id=$2 and user_id=$3 and status='pending'
         and (stripe_payment_intent is null or stripe_payment_intent=$1)`,
      [intent.id, purchaseId, userId],
    );

    if (intent.status === 'succeeded') {
      await fulfillStripeEvent(stripe, {
        id: `workspace-auto-reload:${intent.id}`,
        type: 'payment_intent.succeeded',
        livemode: intent.livemode,
        data: { object: intent },
      } as Stripe.Event);

      await query(
        `update workspace_credit_settings set
           last_auto_reload_at=now(),
           last_auto_reload_error=null,
           last_auto_reload_payment_intent=$2
         where user_id=$1`,
        [userId, intent.id],
      ).catch(() => undefined);

      return { attempted: true, charged: true };
    }

    const message =
      intent.status === 'requires_action'
        ? 'Card requires authentication; complete a manual credit purchase or update the card.'
        : `Auto-reload ended with status ${intent.status}.`;
    await markAutoReloadFailure(userId, purchaseId, intent.id, message);
    return { attempted: true, charged: false, error: message };
  } catch (error) {
    console.error('Workspace auto-reload failed:', error);
    return {
      attempted: true,
      charged: false,
      error: error instanceof Error ? error.message : 'Auto-reload failed.',
    };
  }
}

async function markAutoReloadFailure(
  userId: string,
  purchaseId: string,
  paymentIntentId: string | null,
  message: string,
) {
  await transaction(async (client) => {
    await client.query(
      `update workspace_credit_purchases
       set status='failed',
           stripe_payment_intent=coalesce($3, stripe_payment_intent)
       where id=$1 and user_id=$2 and status='pending'`,
      [purchaseId, userId, paymentIntentId],
    );
    await client
      .query(
        `update workspace_credit_settings set
           last_auto_reload_at=now(),
           last_auto_reload_error=$2,
           last_auto_reload_payment_intent=coalesce($3, last_auto_reload_payment_intent)
         where user_id=$1`,
        [userId, message.slice(0, 500), paymentIntentId],
      )
      .catch(() => undefined);
  });
}


/**
 * Scan users with auto-reload enabled and attempt a charge when balance is at/below threshold.
 * Called from the internal maintenance tick (scripts/start.mjs).
 */
export async function runDueWorkspaceAutoReloads(limit = 25): Promise<{
  scanned: number;
  attempted: number;
  charged: number;
  skipped: number;
  errors: number;
  results: Array<{ userId: string; result: Awaited<ReturnType<typeof maybeAttemptWorkspaceAutoReload>> }>;
}> {
  const rows = await query<{ user_id: string }>(
    `select user_id
     from workspace_credit_settings
     where auto_reload_enabled = true
       and payment_method_id is not null
     order by coalesce(last_auto_reload_at, to_timestamp(0)) asc
     limit $1`,
    [Math.max(1, Math.min(100, Math.floor(limit)))],
  ).catch(() => []);

  const results: Array<{ userId: string; result: Awaited<ReturnType<typeof maybeAttemptWorkspaceAutoReload>> }> = [];
  let attempted = 0;
  let charged = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const result = await maybeAttemptWorkspaceAutoReload(row.user_id);
      results.push({ userId: row.user_id, result });
      if (result.attempted) {
        attempted += 1;
        if (result.charged) charged += 1;
        else if (result.error) errors += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors += 1;
      results.push({
        userId: row.user_id,
        result: {
          attempted: true,
          error: error instanceof Error ? error.message : 'auto-reload failed',
        },
      });
    }
  }

  return { scanned: rows.length, attempted, charged, skipped, errors, results };
}
