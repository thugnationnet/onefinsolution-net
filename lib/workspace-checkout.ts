import 'server-only';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { verifiedStripe } from '@/lib/stripe';
import { workspaceCustomer } from '@/lib/workspace-stripe';
import {
  resolveWorkspaceCreditPresentment,
  type WorkspaceCreditPresentmentQuote,
} from '@/lib/workspace-credit-pack';
import { query } from '@/lib/db';
import { sitePath } from '@/lib/site-url';

export type WorkspaceCheckoutSessionResult = {
  sessionId: string;
  url: string;
  purchaseId: string;
  quote: WorkspaceCreditPresentmentQuote;
};

/**
 * Hosted Stripe Checkout for Workspace credits (primary low-friction path).
 *
 * Design choices for conversion:
 * - mode=payment one-time charge (no subscription)
 * - no setup_future_usage / no forced card-on-file on first purchase
 * - 3DS handled entirely by Stripe-hosted Checkout (custom domain when active)
 * - Custom domain pay.onefinsolution.net is applied by Stripe Dashboard when active
 */
export async function createWorkspaceCreditCheckoutSession(input: {
  userId: string;
  amountUsd?: number | string | null;
  amountCents?: number | string | null;
}): Promise<WorkspaceCheckoutSessionResult> {
  const stripe = await verifiedStripe();
  const customer = await workspaceCustomer(input.userId, true);
  if (!customer) throw new Error('Billing account unavailable.');

  const quote = await resolveWorkspaceCreditPresentment(stripe, {
    amountUsd: input.amountUsd,
    amountCents: input.amountCents,
    allowDefault: true,
  });

  const purchaseId = randomUUID();

  // Ledger row first so webhook/return can fulfill immediately.
  await query(
    `insert into workspace_credit_purchases(id, user_id, amount, credits, status)
     values ($1,$2,$3,$4,'pending')`,
    [purchaseId, input.userId, quote.usdAmountCents, quote.credits],
  );

  const successUrl = sitePath(
    `/workspace?billing=credits_added&purchase_id=${encodeURIComponent(purchaseId)}&session_id={CHECKOUT_SESSION_ID}`,
  );
  const cancelUrl = sitePath(
    `/workspace?billing=cancelled&purchase_id=${encodeURIComponent(purchaseId)}`,
  );

  const sharedMetadata: Stripe.MetadataParam = {
    app: 'chatbot-template',
    billing_scope: 'workspace',
    flow: 'workspace-credit-purchase',
    checkout: 'hosted',
    user_id: input.userId,
    purchase_id: purchaseId,
    credits: String(quote.credits),
    amount_cents: String(quote.usdAmountCents),
    amount_usd: String(quote.amountUsd),
    pack_id: quote.packId,
    presentment_currency: quote.presentmentCurrency,
    presentment_amount_cents: String(quote.presentmentAmountCents),
  };

  const productName =
    quote.credits === 1 ? '1 Workspace credit' : `${quote.credits} Workspace credits`;
  const productDescription = `API / flagship model credits for your Workspace (${quote.label}).`;

  // Always use price_data so presentment currency (USD/THB) matches the charge.
  // Catalog price IDs stay optional and are not required for Checkout.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: quote.presentmentCurrency,
        unit_amount: quote.presentmentAmountCents,
        product_data: {
          name: productName,
          description: productDescription,
          metadata: {
            app: 'chatbot-template',
            billing_scope: 'workspace',
            kind: 'credits',
            credits: String(quote.credits),
            pack_id: quote.packId,
          },
        },
      },
    },
  ];

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer,
        client_reference_id: input.userId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lineItems,
        // One-time capture only — do not request off-session mandates on first buy.
        payment_intent_data: {
          metadata: sharedMetadata,
          description: productName,
        },
        metadata: sharedMetadata,
        billing_address_collection: 'auto',
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        allowed_payment_method_types: ['card'],
        allow_promotion_codes: false,
        submit_type: 'pay',
        locale: 'auto',
      },
      {
        idempotencyKey: `workspace-checkout:${input.userId}:${purchaseId}`,
      },
    );

    if (!session.url) {
      throw new Error('Checkout is temporarily unavailable. Please try again.');
    }

    return {
      sessionId: session.id,
      url: session.url,
      purchaseId,
      quote,
    };
  } catch (error) {
    await query(
      `update workspace_credit_purchases set status='failed'
       where id=$1 and user_id=$2 and status='pending'`,
      [purchaseId, input.userId],
    ).catch(() => undefined);
    throw error;
  }
}

/**
 * After return from hosted Checkout: verify session, fulfill credits if paid.
 * Safe to call repeatedly (fulfillment is idempotent on purchase_id).
 */
export async function finalizeWorkspaceCreditCheckoutSession(input: {
  userId: string;
  sessionId: string;
  purchaseId?: string | null;
}): Promise<'succeeded' | 'pending' | 'failed'> {
  if (!input.sessionId.startsWith('cs_')) {
    throw new Error('Invalid checkout session.');
  }

  const stripe = await verifiedStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ['payment_intent'],
  });

  if (session.metadata?.billing_scope && session.metadata.billing_scope !== 'workspace') {
    throw new Error('Checkout session is not a Workspace purchase.');
  }
  if (session.metadata?.flow && session.metadata.flow !== 'workspace-credit-purchase') {
    throw new Error('Checkout session flow mismatch.');
  }
  if (session.metadata?.user_id && session.metadata.user_id !== input.userId) {
    throw new Error('Checkout session does not belong to this account.');
  }
  if (
    input.purchaseId &&
    session.metadata?.purchase_id &&
    session.metadata.purchase_id !== input.purchaseId
  ) {
    throw new Error('Purchase reference mismatch.');
  }
  if (session.client_reference_id && session.client_reference_id !== input.userId) {
    throw new Error('Checkout customer mismatch.');
  }

  if (session.status === 'expired') return 'failed';
  if (session.payment_status === 'unpaid' && session.status === 'open') return 'pending';
  if (session.payment_status === 'unpaid') return 'failed';

  const piRef = session.payment_intent;
  const paymentIntentId =
    typeof piRef === 'string'
      ? piRef
      : piRef && typeof piRef === 'object'
        ? piRef.id
        : null;

  if (!paymentIntentId) {
    return session.status === 'complete' && session.payment_status === 'paid'
      ? 'pending'
      : 'failed';
  }

  const { applyWorkspaceCreditsFromPaymentIntent } = await import('@/lib/stripe-fulfillment');
  await applyWorkspaceCreditsFromPaymentIntent(stripe, paymentIntentId);

  const intent =
    typeof piRef === 'object' && piRef && 'status' in piRef
      ? (piRef as Stripe.PaymentIntent)
      : await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status === 'succeeded') return 'succeeded';
  if (intent.status === 'canceled') return 'failed';
  if (session.payment_status === 'paid') return 'succeeded';
  return 'pending';
}
