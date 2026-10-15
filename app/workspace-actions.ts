'use server';

import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { currentUser } from '@/lib/session';
import { workspaceCustomer } from '@/lib/workspace-stripe';
import { verifiedStripe } from '@/lib/stripe';
import { query } from '@/lib/db';
import { ensureSignupCredits } from '@/lib/credits';
import { workspaceCreditCost } from '@/lib/credit-config';
import { workspaceCreditPack, resolveWorkspaceCreditQuote, assertWorkspaceCreditAmountCents, WORKSPACE_CREDIT_MIN_AMOUNT_CENTS, WORKSPACE_CREDIT_MAX_AMOUNT_CENTS, formatWorkspaceCreditUsd } from '@/lib/workspace-credit-pack';
import {
  readWorkspaceAutoReloadSettings,
  type WorkspaceAutoReloadSettings,
} from '@/lib/workspace-auto-reload';
import { creditPlans } from '@/lib/credit-config';
import { fulfillStripeEvent } from '@/lib/stripe-fulfillment';
import { throttle } from '@/lib/auth-service';
import { revalidatePath } from 'next/cache';
import { expectedStripeLivemode, stripeObjectMatchesMode } from '@/lib/billing-environment';
import {
  assertCustomerMatchesScope,
  assertSetupIntentOwnedByCustomer,
  requireOwnedPaymentMethod,
  stripeCustomerId as scopedStripeCustomerId,
  stripePaymentMethodId,
} from '@/lib/billing-scope';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stripeCustomerId = scopedStripeCustomerId;

export async function getWorkspaceBillingData() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to open your Workspace.' } as const;
  try {
    await ensureSignupCredits(user.id);
    await query('select reconcile_credit_usage($1)', [user.id]);
    const [balance, usage, transactions, card] = await Promise.all([
      query<{ balance: string }>('select available_credits($1)::text as balance', [user.id]),
      query<{ id: string; status: string; created_at: string }>(
        'select id,status,created_at::text from credit_usage where user_id=$1 order by created_at desc limit 20',
        [user.id],
      ),
      query<{ id: string; amount: number; currency: string; credits: number; receipt_url?: string | null; created_at: string }>(
        'select id,amount,currency,credits,receipt_url,created_at::text from workspace_credit_transactions where user_id=$1 order by created_at desc limit 20',
        [user.id],
      ),
      query<{ card_brand: string | null; card_last4: string | null; card_exp_month: number | null; card_exp_year: number | null }>(
        'select card_brand,card_last4,card_exp_month,card_exp_year from workspace_credit_settings where user_id=$1',
        [user.id],
      ),
    ]);
    return {
      balance: Number(balance[0]?.balance || 0),
      creditCost: workspaceCreditCost(),
      usage: usage.map((item) => ({ ...item, credits: item.status === 'completed' ? workspaceCreditCost() : 0 })),
      transactions,
      card: card[0] || null,
      autoReload: await readWorkspaceAutoReloadSettings(user.id),
    } as const;
  } catch (error) {
    console.error('Unable to load Workspace billing data:', error);
    return { error: 'Workspace billing data is temporarily unavailable.' } as const;
  }
}

export type WorkspaceSavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

async function saveWorkspaceCardSummary(userId: string, method: Stripe.PaymentMethod | null) {
  await query(
    `insert into workspace_credit_settings(
       user_id,payment_method_id,card_brand,card_last4,card_exp_month,card_exp_year,updated_at
     ) values($1,$2,$3,$4,$5,$6,now())
     on conflict(user_id) do update set payment_method_id=excluded.payment_method_id,
       card_brand=excluded.card_brand,card_last4=excluded.card_last4,
       card_exp_month=excluded.card_exp_month,card_exp_year=excluded.card_exp_year,updated_at=now()`,
    [
      userId,
      method?.id ?? null,
      method?.card?.brand ?? null,
      method?.card?.last4 ?? null,
      method?.card?.exp_month ?? null,
      method?.card?.exp_year ?? null,
    ],
  );
}

export async function listWorkspacePaymentMethods() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace payment methods.' } as const;
  try {
    const customer = await workspaceCustomer(user.id);
    if (!customer) return { methods: [] as WorkspaceSavedPaymentMethod[] } as const;
    const stripe = await verifiedStripe();
    const customerRecord = await stripe.customers.retrieve(customer);
    assertCustomerMatchesScope(customerRecord, 'workspace', user.id);
    const defaultValue = customerRecord.invoice_settings?.default_payment_method;
    const defaultId = typeof defaultValue === 'string' ? defaultValue : defaultValue?.id || null;
    const methods: WorkspaceSavedPaymentMethod[] = [];
    for await (const method of stripe.paymentMethods.list({ customer, type: 'card', limit: 100 })) {
      methods.push({
        id: method.id,
        brand: method.card?.brand || 'card',
        last4: method.card?.last4 || 'â€¢â€¢â€¢â€¢',
        expMonth: method.card?.exp_month ?? null,
        expYear: method.card?.exp_year ?? null,
        isDefault: method.id === defaultId,
      });
    }
    methods.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { methods } as const;
  } catch (error) {
    console.error('Unable to load Workspace payment methods:', error);
    return { error: 'Workspace payment methods are temporarily unavailable.' } as const;
  }
}

export async function confirmWorkspaceCreditWithSavedMethod(
  purchaseId: string,
  paymentMethodId: string,
): Promise<{ error?: string; ok?: true; paymentIntentId?: string; clientSecret?: string }> {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in.' };
  if (!uuid.test(purchaseId) || !paymentMethodId.startsWith('pm_')) {
    return { error: 'Invalid payment request.' };
  }
  try {
    const [purchase] = await query<{
      id: string;
      user_id: string;
      stripe_payment_intent: string | null;
      status: string;
    }>(
      `select id, user_id, stripe_payment_intent, status, receipt_url
       from workspace_credit_purchases where id=$1`,
      [purchaseId],
    );
    if (!purchase || purchase.user_id !== user.id) return { error: 'Purchase not found.' };
    if (purchase.status === 'succeeded') {
      return { ok: true, paymentIntentId: purchase.stripe_payment_intent || undefined };
    }
    if (!purchase.stripe_payment_intent) return { error: 'Payment not started.' };

    const customerId = await workspaceCustomer(user.id, false);
    if (!customerId) return { error: 'Workspace billing account unavailable.' };
    const stripe = await verifiedStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) {
      return { error: 'Payment method is not saved on your Workspace account.' };
    }

    const confirmed = await stripe.paymentIntents.confirm(purchase.stripe_payment_intent, {
      payment_method: paymentMethodId,
          });

    if (confirmed.status === 'requires_action') {
      return {
        error: 'additional_action_required',
        paymentIntentId: confirmed.id,
        clientSecret: confirmed.client_secret || undefined,
      };
    }
    if (confirmed.status !== 'succeeded') {
      return { error: `Payment status: ${confirmed.status}` };
    }

    await query(
      `insert into workspace_credit_settings(user_id, payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, updated_at)
       values ($1,$2,$3,$4,$5,$6,now())
       on conflict (user_id) do update set
         payment_method_id=excluded.payment_method_id,
         card_brand=excluded.card_brand,
         card_last4=excluded.card_last4,
         card_exp_month=excluded.card_exp_month,
         card_exp_year=excluded.card_exp_year,
         updated_at=now()`,
      [
        user.id,
        paymentMethodId,
        pm.card?.brand || null,
        pm.card?.last4 || null,
        pm.card?.exp_month || null,
        pm.card?.exp_year || null,
      ],
    );
    await stripe.customers
      .update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })
      .catch(() => undefined);

    revalidatePath('/workspace');
    return { ok: true, paymentIntentId: confirmed.id };
  } catch (error) {
    console.error('confirmWorkspaceCreditWithSavedMethod failed', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to confirm payment with saved card.',
    };
  }
}


export async function setWorkspaceDefaultPaymentMethod(paymentMethodId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace payment methods.' } as const;
  if (!/^pm_[a-zA-Z0-9]+$/.test(paymentMethodId)) return { error: 'Invalid Workspace payment method.' } as const;
  try {
    const customer = await workspaceCustomer(user.id);
    if (!customer) return { error: 'No Workspace payment method is saved yet.' } as const;
    const stripe = await verifiedStripe();
    const method = await requireOwnedPaymentMethod(stripe, customer, paymentMethodId);
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: method.id } });
    await saveWorkspaceCardSummary(user.id, method);
    revalidatePath('/workspace');
    revalidatePath('/account');
    return { success: true, message: 'Workspace default payment method updated.' } as const;
  } catch (error) {
    console.error('Unable to update Workspace default payment method:', error);
    return { error: 'Unable to update the Workspace default card.' } as const;
  }
}

export async function removeWorkspacePaymentMethod(paymentMethodId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace payment methods.' } as const;
  if (!/^pm_[a-zA-Z0-9]+$/.test(paymentMethodId)) return { error: 'Invalid Workspace payment method.' } as const;
  try {
    const customer = await workspaceCustomer(user.id);
    if (!customer) return { error: 'No Workspace payment method is saved yet.' } as const;
    const stripe = await verifiedStripe();
    const method = await requireOwnedPaymentMethod(stripe, customer, paymentMethodId);
    const customerRecord = await stripe.customers.retrieve(customer);
    if (customerRecord.deleted || !stripeObjectMatchesMode(customerRecord.livemode)) {
      return { error: 'That card is not saved in your Workspace.' } as const;
    }
    const defaultValue = customerRecord.invoice_settings?.default_payment_method;
    const defaultId = typeof defaultValue === 'string' ? defaultValue : defaultValue?.id || null;
    await stripe.paymentMethods.detach(method.id);
    const remaining = await stripe.paymentMethods.list({ customer, type: 'card', limit: 100 });
    const nextDefault = defaultId === method.id ? remaining.data[0] || null : null;
    if (defaultId === method.id) {
      await stripe.customers.update(customer, {
        invoice_settings: { default_payment_method: nextDefault?.id || '' },
      });
    }
    const summaryMethod = defaultId && defaultId !== method.id
      ? await stripe.paymentMethods.retrieve(defaultId)
      : nextDefault;
    if (summaryMethod && stripeCustomerId(summaryMethod.customer) !== customer) {
      throw new Error('Workspace default card is not attached to the billing customer.');
    }
    await saveWorkspaceCardSummary(user.id, summaryMethod);
    revalidatePath('/workspace');
    revalidatePath('/account');
    return { success: true, message: 'Workspace payment method removed.' } as const;
  } catch (error) {
    console.error('Unable to remove Workspace payment method:', error);
    return { error: 'Unable to remove the Workspace payment method.' } as const;
  }
}

export async function createWorkspaceCreditPaymentIntent(
  purchaseId?: string | null,
  amountUsd?: number | string | null,
) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to buy Workspace credits.' } as const;
  // Allow the dedicated /checkout/credits page to omit purchaseId — create a fresh pending row.
  const resolvedPurchaseId =
    purchaseId && uuid.test(purchaseId) ? purchaseId : randomUUID();
  if (purchaseId && !uuid.test(purchaseId)) {
    return { error: 'Invalid purchase id.' } as const;
  }
  const purchaseIdFinal = resolvedPurchaseId;

  let quote;
  try {
    quote = resolveWorkspaceCreditQuote({ amountUsd, allowDefault: true });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid credit amount.',
    } as const;
  }

  try {
    const customer = await workspaceCustomer(user.id, true);
    if (!customer) return { error: 'Workspace billing account unavailable.' } as const;
    const stripe = await verifiedStripe();

    const [purchase] = await query<{
      id: string;
      user_id: string;
      stripe_payment_intent: string | null;
      status: string;
      amount: number;
      credits: number;
    }>(
      `insert into workspace_credit_purchases(id,user_id,amount,credits,status)
       values($1,$2,$3,$4,'pending')
       on conflict(id) do update set
         amount = excluded.amount,
         credits = excluded.credits,
         id = excluded.id
       where workspace_credit_purchases.user_id = excluded.user_id
         and workspace_credit_purchases.status = 'pending'
       returning id,user_id,stripe_payment_intent,status,amount,credits`,
      [purchaseIdFinal, user.id, quote.amountCents, quote.credits],
    );
    if (!purchase || purchase.user_id !== user.id) {
      return { error: 'Unable to start credit purchase.' } as const;
    }
    if (purchase.status === 'succeeded') {
      return { error: 'This purchase was already completed.' } as const;
    }

    try {
      assertWorkspaceCreditAmountCents(Number(purchase.amount));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invalid purchase amount.',
      } as const;
    }

    let intentId = purchase.stripe_payment_intent;
    let clientSecret: string | null = null;

    if (intentId) {
      const existing = await stripe.paymentIntents.retrieve(intentId);
      if (existing.metadata?.billing_scope !== 'workspace') {
        return { error: 'Payment scope mismatch.' } as const;
      }
      if (existing.status === 'succeeded') {
        return { error: 'This purchase was already paid.' } as const;
      }
      if (
        existing.amount !== Number(purchase.amount) &&
        ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)
      ) {
        const updated = await stripe.paymentIntents.update(intentId, {
          amount: Number(purchase.amount),
          metadata: {
            ...(existing.metadata || {}),
            amount_cents: String(purchase.amount),
            credits: String(purchase.credits),
            pack_id: quote.packId,
          },
        });
        clientSecret = updated.client_secret;
      } else {
        clientSecret = existing.client_secret;
      }
    } else {
      const intent = await stripe.paymentIntents.create({
        amount: Number(purchase.amount),
        currency: 'usd',
        customer,
        receipt_email: user.email,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        setup_future_usage: 'off_session',
        metadata: {
          app: 'chatbot-template',
          billing_scope: 'workspace',
          flow: 'workspace-credit-purchase',
          user_id: user.id,
          purchase_id: purchase.id,
          pack_id: quote.packId,
          amount_cents: String(purchase.amount),
          credits: String(purchase.credits),
        },
        description: `Workspace credits · ${purchase.credits} credits (${formatWorkspaceCreditUsd(Number(purchase.amount))})`,
      });
      intentId = intent.id;
      clientSecret = intent.client_secret;
      await query(
        `update workspace_credit_purchases
         set stripe_payment_intent=$2
         where id=$1 and user_id=$3 and status='pending'`,
        [purchase.id, intentId, user.id],
      );
    }

    if (!clientSecret || !intentId) {
      return { error: 'Unable to start Stripe payment.' } as const;
    }

    let savedMethods: Array<{
      id: string;
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
      isDefault: boolean;
    }> = [];
    try {
      const customerIdForList = customer;
      const [settingsRow] = await query<{ payment_method_id: string | null }>(
        'select payment_method_id from workspace_credit_settings where user_id=$1',
        [user.id],
      );
      const cust = await stripe.customers.retrieve(customerIdForList);
      const defaultId =
        !('deleted' in cust && cust.deleted) &&
        typeof cust.invoice_settings?.default_payment_method === 'string'
          ? cust.invoice_settings.default_payment_method
          : settingsRow?.payment_method_id || null;
      const listed = await stripe.paymentMethods.list({ customer: customerIdForList, type: 'card' });
      savedMethods = listed.data
        .filter((pm) => pm.card)
        .map((pm) => ({
          id: pm.id,
          brand: pm.card!.brand || 'card',
          last4: pm.card!.last4 || '????',
          expMonth: pm.card!.exp_month || 0,
          expYear: pm.card!.exp_year || 0,
          isDefault: pm.id === (settingsRow?.payment_method_id || defaultId),
        }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    } catch {
      savedMethods = [];
    }

    return {
      clientSecret,
      purchaseId: purchase.id,
      amountCents: Number(purchase.amount),
      credits: Number(purchase.credits),
      amountLabel: formatWorkspaceCreditUsd(Number(purchase.amount)),
      minAmountCents: WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
      maxAmountCents: WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
      savedMethods,
    } as const;
  } catch (error) {
    console.error('createWorkspaceCreditPaymentIntent failed', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to start credit purchase.',
    } as const;
  }
}


export async function workspaceCreditPurchaseStatus(purchaseId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to view this purchase.' } as const;
  if (!uuid.test(purchaseId)) return { error: 'Invalid purchase reference.' } as const;
  try {
    const [purchase] = await query<{ stripe_payment_intent: string | null; status: string }>(
      'select stripe_payment_intent,status from workspace_credit_purchases where id=$1 and user_id=$2',
      [purchaseId, user.id],
    );
    if (!purchase) return { error: 'Purchase not found.' } as const;
    if (purchase.status === 'succeeded') return { status: 'succeeded' } as const;
    if (!purchase.stripe_payment_intent) return { status: 'pending' } as const;

    const stripe = await verifiedStripe();
    const intent = await stripe.paymentIntents.retrieve(purchase.stripe_payment_intent, { expand: ['payment_method'] });
    if (intent.metadata.purchase_id !== purchaseId || intent.metadata.user_id !== user.id ||
        intent.metadata.flow !== 'workspace-credit-purchase') {
      return { error: 'Purchase verification failed.' } as const;
    }
    if (intent.status === 'succeeded') {
      await fulfillStripeEvent(stripe, {
        id: `workspace-purchase-status:${intent.id}`,
        type: 'payment_intent.succeeded',
        livemode: expectedStripeLivemode(),
        data: { object: { id: intent.id } },
      } as Stripe.Event);
      revalidatePath('/workspace');
      return { status: 'succeeded' } as const;
    }
    if (intent.status === 'canceled') return { status: 'failed' } as const;
    return { status: 'pending' } as const;
  } catch (error) {
    console.error('Unable to verify Workspace credit purchase:', error);
    return { error: 'Unable to verify the payment yet. Please refresh and check your transactions.' } as const;
  }
}

export async function prepareWorkspaceCardUpdate() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace payment settings.' } as const;
  try {
    await throttle(`workspace-payment-method:${user.id}`, 10);
    const customer = await workspaceCustomer(user.id, true);
    if (!customer) throw new Error('Billing account unavailable.');
    const stripe = await verifiedStripe();
    const setup = await stripe.setupIntents.create({
      customer,
      usage: 'off_session',
      allowed_payment_method_types: ['card'],
      metadata: { app: 'chatbot-template', flow: 'workspace-credit-card', user_id: user.id },
    }, { idempotencyKey: `workspace-card:${user.id}:${randomUUID()}` });
    if (!setup.client_secret) throw new Error('Card setup is unavailable.');
    return { clientSecret: setup.client_secret } as const;
  } catch (error) {
    console.error('Unable to prepare Workspace card setup:', error);
    return { error: 'Unable to prepare secure card setup. Please try again.' } as const;
  }
}

export async function setWorkspaceAutoReloadSettings(input: {
  enabled: boolean;
  threshold?: number;
  amountUsd?: number | string | null;
  amountCents?: number | string | null;
}): Promise<{ ok?: true; error?: string; autoReload?: WorkspaceAutoReloadSettings }> {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace auto-reload.' };
  if (!input || typeof input.enabled !== 'boolean') {
    return { error: 'Invalid auto-reload settings.' };
  }

  const threshold =
    input.threshold == null || input.threshold === undefined
      ? 1
      : Math.floor(Number(input.threshold));
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1_000_000) {
    return { error: 'Choose a valid auto-reload threshold.' };
  }

  let reloadAmountCents = workspaceCreditPack.amount;
  try {
    if (
      (input.amountCents != null && String(input.amountCents).trim() !== '') ||
      (input.amountUsd != null && String(input.amountUsd).trim() !== '')
    ) {
      reloadAmountCents = resolveWorkspaceCreditQuote({
        amountCents: input.amountCents,
        amountUsd: input.amountUsd,
        allowDefault: false,
      }).amountCents;
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid auto-reload amount.',
    };
  }

  try {
    const [card] = await query<{ payment_method_id: string | null }>(
      'select payment_method_id from workspace_credit_settings where user_id=$1',
      [user.id],
    );
    if (input.enabled && !card?.payment_method_id) {
      return { error: 'Save a Workspace card before enabling auto-reload.' };
    }

    await query(
      `insert into workspace_credit_settings(
         user_id, auto_reload_enabled, auto_reload_threshold, reload_amount_cents, updated_at
       ) values ($1,$2,$3,$4,now())
       on conflict (user_id) do update set
         auto_reload_enabled=excluded.auto_reload_enabled,
         auto_reload_threshold=excluded.auto_reload_threshold,
         reload_amount_cents=excluded.reload_amount_cents,
         updated_at=now()`,
      [user.id, input.enabled, threshold, reloadAmountCents],
    );

    revalidatePath('/workspace');
    return {
      ok: true as const,
      autoReload: await readWorkspaceAutoReloadSettings(user.id),
    };
  } catch (error) {
    console.error('Unable to update Workspace auto-reload settings:', error);
    try {
      await query(
        `insert into workspace_credit_settings(
           user_id, auto_reload_enabled, auto_reload_threshold, updated_at
         ) values ($1,$2,$3,now())
         on conflict (user_id) do update set
           auto_reload_enabled=excluded.auto_reload_enabled,
           auto_reload_threshold=excluded.auto_reload_threshold,
           updated_at=now()`,
        [user.id, input.enabled, threshold],
      );
      revalidatePath('/workspace');
      return {
        ok: true as const,
        autoReload: await readWorkspaceAutoReloadSettings(user.id),
      };
    } catch {
      return {
        error:
          error instanceof Error && /auto_reload|reload_amount/i.test(error.message)
            ? 'Auto-reload is not available until database migrations 015/016 are applied.'
            : 'Unable to update auto-reload settings. Please try again.',
      };
    }
  }
}


export async function saveWorkspaceCard(setupIntentId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace payment settings.' } as const;
  if (!/^seti_[a-zA-Z0-9]+$/.test(setupIntentId)) return { error: 'Invalid card setup reference.' } as const;
  try {
    const customer = await workspaceCustomer(user.id);
    const stripe = await verifiedStripe();
    if (!customer) throw new Error('Card verification failed.');
    const setup = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
    assertSetupIntentOwnedByCustomer(setup, customer);
    const metadata = setup.metadata || {};
    if (
      metadata.app !== 'chatbot-template' ||
      metadata.flow !== 'workspace-credit-card' ||
      metadata.user_id !== user.id
    ) {
      throw new Error('Card verification failed.');
    }
    const methodId = stripePaymentMethodId(setup.payment_method);
    if (!methodId) throw new Error('Card verification failed.');
    const method = await requireOwnedPaymentMethod(stripe, customer, methodId);
    if (method.type !== 'card' || !method.card) throw new Error('Card verification failed.');
    await query(
      `insert into workspace_credit_settings(user_id,payment_method_id,card_brand,card_last4,card_exp_month,card_exp_year,updated_at)
       values($1,$2,$3,$4,$5,$6,now())
       on conflict(user_id) do update set payment_method_id=excluded.payment_method_id,card_brand=excluded.card_brand,
         card_last4=excluded.card_last4,card_exp_month=excluded.card_exp_month,card_exp_year=excluded.card_exp_year,updated_at=now()`,
      [user.id, method.id, method.card.brand, method.card.last4, method.card.exp_month, method.card.exp_year],
    );
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: method.id } });
    revalidatePath('/workspace');
    revalidatePath('/account');
    return { success: true } as const;
  } catch (error) {
    console.error('Unable to save Workspace card:', error);
    return { error: 'Unable to verify and save this card. Please try again.' } as const;
  }
}
