'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { currentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { throttle } from '@/lib/auth-service';
import { verifiedStripe } from '@/lib/stripe';
import { softwareCustomer } from '@/lib/software-stripe';
import {
  getSoftwarePurchaseItem,
  parseSoftwarePaymentAmount,
  remainingBalanceCents,
} from '@/lib/software-purchase';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';
import {
  assertCustomerMatchesScope,
  assertSetupIntentOwnedByCustomer,
  requireOwnedPaymentMethod,
  stripePaymentMethodId,
} from '@/lib/billing-scope';
import { updateSoftwareBillingProfile as persistSoftwareBillingProfile, type SoftwareBillingProfile } from '@/lib/software-billing-profile';
import { syncSoftwareCustomerProfile } from '@/lib/software-stripe';
import { fulfillSoftwareStorefrontPayment } from '@/lib/software-storefront-fulfillment';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


const stripeId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id || null;

export async function createSoftwarePaymentIntent(input: {
  kind: string;
  id: string;
  amount: string;
  purchaseId: string;
  savePaymentMethod: boolean;
  /** Optional agreed project price in dollars. Defaults to catalog price. */
  agreedPrice?: string;
}): Promise<{
  clientSecret?: string;
  error?: string;
  agreedPriceCents?: number;
  amountCents?: number;
  remainingBalanceCents?: number;
  savedMethods?: Array<{ id: string; brand: string; last4: string; expMonth?: number; expYear?: number; isDefault?: boolean }>;
}> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to continue to the software checkout.' };
  if (!input || typeof input !== 'object' ||
      typeof input.kind !== 'string' || typeof input.id !== 'string' ||
      typeof input.amount !== 'string' || typeof input.purchaseId !== 'string' ||
      typeof input.savePaymentMethod !== 'boolean' || !uuid.test(input.purchaseId)) {
    return { error: 'Invalid purchase request.' };
  }
  const item = getSoftwarePurchaseItem(input.kind, input.id);
  if (!item) return { error: 'That Software item is no longer available.' };

  // Agreed project price drives remaining balance; catalog is the default.
  let agreedPriceCents = item.priceCents;
  if (input.agreedPrice != null && String(input.agreedPrice).trim() !== '') {
    const parsedAgreed = parseSoftwarePaymentAmount(String(input.agreedPrice), 50_000_000, 500);
    if (parsedAgreed == null) return { error: 'Enter a valid agreed project price.' };
    agreedPriceCents = parsedAgreed;
  }

  // Flexible initial payment: min..agreed (deposit, custom, or full). Never pretends deposit is full paid.
  const amountCents = parseSoftwarePaymentAmount(input.amount, agreedPriceCents, 500);
  if (amountCents === null) {
    return { error: `Choose an amount from $5.00 up to $${(agreedPriceCents / 100).toFixed(2)}.` };
  }

  try {
    await throttle(`software-purchase:${user.id}`, 10);
    const customer = await softwareCustomer(user.id, true);
    if (!customer) throw new Error('Software billing account unavailable.');
    const stripe = await verifiedStripe();
    const customerRecord = await stripe.customers.retrieve(customer);
    if (customerRecord.deleted || !stripeObjectMatchesMode(customerRecord.livemode) ||
        customerRecord.metadata.app !== 'onefin-software-store' ||
        customerRecord.metadata.billing_scope !== 'software' ||
        customerRecord.metadata.user_id !== user.id) {
      throw new Error('Software billing customer verification failed.');
    }

    // amount_paid_cents starts at 0 — only successful ledger rows increase it.
    const [purchase] = await query<{
      id: string;
      stripe_payment_intent_id: string | null;
      status: string;
      amount_paid_cents: number;
      total_price_cents: number;
    }>(
      `insert into software_storefront_purchases(
         id,user_id,item_kind,item_id,item_name,customer_email,
         amount_paid_cents,total_price_cents,currency,status,inquiry_status
       ) values($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','inquiry')
       on conflict(id) do update set
         customer_email=excluded.customer_email
       where software_storefront_purchases.user_id=excluded.user_id
         and software_storefront_purchases.item_id=excluded.item_id
         and software_storefront_purchases.item_kind=excluded.item_kind
         and software_storefront_purchases.status in ('pending','partially_paid','failed')
         and software_storefront_purchases.amount_paid_cents=0
         and software_storefront_purchases.total_price_cents=excluded.total_price_cents
       returning id,stripe_payment_intent_id,status,amount_paid_cents,total_price_cents`,
      [
        input.purchaseId,
        user.id,
        item.kind,
        item.id,
        item.name,
        user.email,
        agreedPriceCents,
      ],
    );
    if (!purchase || !['pending', 'partially_paid'].includes(purchase.status)) {
      return { error: 'This purchase request is no longer available.' };
    }

    const remaining = remainingBalanceCents({
      agreedPriceCents: purchase.total_price_cents,
      amountPaidCents: purchase.amount_paid_cents,
    });
    if (amountCents > remaining) {
      return {
        error: remaining > 0
          ? `Outstanding balance is $${(remaining / 100).toFixed(2)}. Enter up to that amount.`
          : 'This project is already fully paid.',
      };
    }

    let intent: Stripe.PaymentIntent;
    if (purchase.stripe_payment_intent_id && purchase.status === 'pending' && purchase.amount_paid_cents === 0) {
      // Reuse only the original pending deposit PI (idempotent retry), not later installments.
      intent = await stripe.paymentIntents.retrieve(purchase.stripe_payment_intent_id);
      if (
        intent.status === 'requires_payment_method' ||
        intent.status === 'requires_confirmation' ||
        intent.status === 'requires_action'
      ) {
        if (intent.amount !== amountCents) {
          intent = await stripe.paymentIntents.update(intent.id, {
            amount: amountCents,
            metadata: {
              ...intent.metadata,
              full_price_cents: String(purchase.total_price_cents),
              installment_amount_cents: String(amountCents),
            },
          });
        }
      }
    } else {
      intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer,
        receipt_email: user.email,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        setup_future_usage: input.savePaymentMethod ? 'off_session' : undefined,
        metadata: {
          app: 'onefin-software-store',
          billing_scope: 'software',
          flow: 'software-storefront-checkout',
          initiated_by: 'customer',
          user_id: user.id,
          purchase_id: purchase.id,
          item_kind: item.kind,
          item_id: item.id,
          item_name: item.name,
          catalog_price_usd: String(Math.round(item.priceCents / 100)),
          ...(item.stripePriceId ? { stripe_price_id: item.stripePriceId } : {}),
          ...(item.stripeProductId ? { stripe_product_id: item.stripeProductId } : {}),
          ...(item.stripeProductLookupKey
            ? { stripe_product_lookup_key: item.stripeProductLookupKey }
            : {}),
          full_price_cents: String(purchase.total_price_cents),
          installment_amount_cents: String(amountCents),
        },
        description: `Software storefront · ${item.name}`,
      });
    }

    await query(
      `insert into software_storefront_payments(
         purchase_id,user_id,amount_cents,currency,status,stripe_payment_intent_id,initiated_by
       ) values ($1,$2,$3,'usd','pending',$4,'customer')
       on conflict (stripe_payment_intent_id) do nothing`,
      [purchase.id, user.id, amountCents, intent.id],
    );

    if (!purchase.stripe_payment_intent_id) {
      await query(
        `update software_storefront_purchases set stripe_payment_intent_id=$1
         where id=$2 and user_id=$3 and stripe_payment_intent_id is null`,
        [intent.id, purchase.id, user.id],
      );
    }

    if (!intent.client_secret) return { error: 'Unable to start Software checkout.' };
    const saved = await listSoftwarePaymentMethods().catch(() => ({ methods: [] as Array<{ id: string; brand: string; last4: string }> }));
    return {
      savedMethods: [...(saved.methods || [])],
      clientSecret: intent.client_secret,
      agreedPriceCents: purchase.total_price_cents,
      amountCents,
      remainingBalanceCents: Math.max(0, remaining - amountCents),
    };
  } catch (error) {
    console.error('Unable to create software payment intent:', error);
    return { error: 'Unable to start Software checkout. Please try again.' };
  }
}

export async function softwarePurchaseStatus(purchaseId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to verify this Software payment.' } as const;
  if (!uuid.test(purchaseId)) return { error: 'Invalid purchase.' } as const;

  try {
    const [purchase] = await query<{
      id: string;
      status: string;
      amount_paid_cents: number;
      total_price_cents: number;
      stripe_payment_intent_id: string | null;
      inquiry_status: string;
      item_name: string;
    }>(
      `select id,status,amount_paid_cents,total_price_cents,stripe_payment_intent_id,inquiry_status,item_name
       from software_storefront_purchases where id=$1 and user_id=$2`,
      [purchaseId, user.id],
    );
    if (!purchase) return { error: 'Purchase not found.' } as const;

    const remaining = remainingBalanceCents({
      agreedPriceCents: purchase.total_price_cents,
      amountPaidCents: purchase.amount_paid_cents,
    });
    const summary = {
      purchaseId: purchase.id,
      paymentStatus: purchase.status,
      inquiryStatus: purchase.inquiry_status,
      itemName: purchase.item_name,
      agreedPriceCents: purchase.total_price_cents,
      amountPaidCents: purchase.amount_paid_cents,
      remainingBalanceCents: remaining,
      fullyPaid: remaining === 0 && purchase.amount_paid_cents > 0,
    } as const;

    // Already accounted via webhook/ledger — never collapse deposit into "paid" unless balance is 0.
    if (purchase.status === 'paid') {
      return { status: 'paid' as const, ...summary };
    }
    if (purchase.status === 'partially_paid') {
      return { status: 'partially_paid' as const, ...summary };
    }

    const paymentIntentId = purchase.stripe_payment_intent_id;
    if (!paymentIntentId || !/^pi_/.test(paymentIntentId)) {
      return { status: 'pending' as const, ...summary };
    }

    const stripe = await verifiedStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      intent.metadata?.app !== 'onefin-software-store' ||
      intent.metadata.billing_scope !== 'software' ||
      intent.metadata.user_id !== user.id ||
      intent.metadata.purchase_id !== purchaseId
    ) {
      return { error: 'Purchase verification failed.' } as const;
    }

    if (intent.status === 'succeeded' || intent.status === 'canceled') {
      await fulfillSoftwareStorefrontPayment(stripe, {
        id: `software-purchase-status:${intent.id}`,
        type: intent.status === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.canceled',
        livemode: intent.livemode,
        data: { object: intent },
      } as unknown as Stripe.Event);
      revalidatePath('/software/account');

      const [fresh] = await query<{
        status: string;
        amount_paid_cents: number;
        total_price_cents: number;
        inquiry_status: string;
        item_name: string;
      }>(
        `select status,amount_paid_cents,total_price_cents,inquiry_status,item_name
         from software_storefront_purchases where id=$1 and user_id=$2`,
        [purchaseId, user.id],
      );
      if (!fresh) return { error: 'Purchase not found.' } as const;
      const rem = remainingBalanceCents({
        agreedPriceCents: fresh.total_price_cents,
        amountPaidCents: fresh.amount_paid_cents,
      });
      return {
        status: fresh.status as 'pending' | 'partially_paid' | 'paid' | 'failed',
        purchaseId,
        paymentStatus: fresh.status,
        inquiryStatus: fresh.inquiry_status,
        itemName: fresh.item_name,
        agreedPriceCents: fresh.total_price_cents,
        amountPaidCents: fresh.amount_paid_cents,
        remainingBalanceCents: rem,
        fullyPaid: rem === 0 && fresh.amount_paid_cents > 0,
      } as const;
    }

    if (['requires_payment_method', 'canceled'].includes(intent.status)) {
      return { status: 'failed' as const, ...summary, paymentStatus: 'failed' };
    }

    return { status: 'pending' as const, ...summary };
  } catch (error) {
    console.error('Unable to verify software storefront purchase:', error);
    const [updated] = await query<{
      status: string;
      amount_paid_cents: number;
      total_price_cents: number;
    }>(
      'select status,amount_paid_cents,total_price_cents from software_storefront_purchases where id=$1 and user_id=$2',
      [purchaseId, user.id],
    );
    if (updated?.status === 'paid') {
      return {
        status: 'paid' as const,
        fullyPaid: true,
        agreedPriceCents: updated.total_price_cents,
        amountPaidCents: updated.amount_paid_cents,
        remainingBalanceCents: 0,
      } as const;
    }
    if (updated?.status === 'partially_paid') {
      return {
        status: 'partially_paid' as const,
        fullyPaid: false,
        agreedPriceCents: updated.total_price_cents,
        amountPaidCents: updated.amount_paid_cents,
        remainingBalanceCents: remainingBalanceCents({
          agreedPriceCents: updated.total_price_cents,
          amountPaidCents: updated.amount_paid_cents,
        }),
      } as const;
    }
    return { error: 'Unable to verify this payment yet. Refresh the software account later.' } as const;
  }
}


/** Collect outstanding balance (customer-initiated installment). Company-initiated uses same ledger with initiated_by=company via webhook metadata. */
export async function createSoftwareBalancePaymentIntent(input: {
  purchaseId: string;
  amount: string;
  savePaymentMethod?: boolean;
}): Promise<{
  clientSecret?: string;
  error?: string;
  amountCents?: number;
  remainingBalanceCents?: number;
  agreedPriceCents?: number;
  savedMethods?: Array<{ id: string; brand: string; last4: string; expMonth?: number; expYear?: number; isDefault?: boolean }>;
}> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to continue to the software checkout.' };
  if (!input || typeof input.purchaseId !== 'string' || typeof input.amount !== 'string' || !uuid.test(input.purchaseId)) {
    return { error: 'Invalid payment request.' };
  }

  try {
    await throttle(`software-balance:${user.id}`, 10);
    const [purchase] = await query<{
      id: string;
      item_kind: string;
      item_id: string;
      item_name: string;
      amount_paid_cents: number;
      total_price_cents: number;
      status: string;
    }>(
      `select id,item_kind,item_id,item_name,amount_paid_cents,total_price_cents,status
       from software_storefront_purchases where id=$1 and user_id=$2`,
      [input.purchaseId, user.id],
    );
    if (!purchase) return { error: 'Purchase not found.' };
    if (purchase.status === 'paid') return { error: 'This project is already fully paid.' };
    if (!['pending', 'partially_paid', 'failed'].includes(purchase.status)) {
      return { error: 'This purchase cannot accept another payment right now.' };
    }

    const remaining = remainingBalanceCents({
      agreedPriceCents: purchase.total_price_cents,
      amountPaidCents: purchase.amount_paid_cents,
    });
    if (remaining <= 0) return { error: 'This project is already fully paid.' };

    const minimumCents = remaining < 500 ? remaining : 500;
    const amountCents = parseSoftwarePaymentAmount(input.amount, remaining, minimumCents);
    if (amountCents === null) {
      return { error: `Choose an amount from $5.00 up to $${(remaining / 100).toFixed(2)}.` };
    }

    const customer = await softwareCustomer(user.id, true);
    if (!customer) throw new Error('Software billing account unavailable.');
    const stripe = await verifiedStripe();
    const catalogItem = getSoftwarePurchaseItem(purchase.item_kind, purchase.item_id);

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer,
      receipt_email: user.email,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      setup_future_usage: input.savePaymentMethod ? 'off_session' : undefined,
      metadata: {
        app: 'onefin-software-store',
        billing_scope: 'software',
        flow: 'software-storefront-balance',
        initiated_by: 'customer',
        user_id: user.id,
        purchase_id: purchase.id,
        item_kind: purchase.item_kind,
        item_id: purchase.item_id,
        item_name: purchase.item_name,
        catalog_price_usd: String(Math.round(purchase.total_price_cents / 100)),
        ...(catalogItem?.stripePriceId ? { stripe_price_id: catalogItem.stripePriceId } : {}),
        ...(catalogItem?.stripeProductId ? { stripe_product_id: catalogItem.stripeProductId } : {}),
        ...(catalogItem?.stripeProductLookupKey
          ? { stripe_product_lookup_key: catalogItem.stripeProductLookupKey }
          : {}),
        full_price_cents: String(purchase.total_price_cents),
        installment_amount_cents: String(amountCents),
      },
      description: `Software balance · ${purchase.item_name}`,
    });

    await query(
      `insert into software_storefront_payments(
         purchase_id,user_id,amount_cents,currency,status,stripe_payment_intent_id,initiated_by
       ) values ($1,$2,$3,'usd','pending',$4,'customer')
       on conflict (stripe_payment_intent_id) do nothing`,
      [purchase.id, user.id, amountCents, intent.id],
    );

    if (!intent.client_secret) return { error: 'Unable to start the balance payment.' };
    const saved = await listSoftwarePaymentMethods().catch(() => ({ methods: [] as Array<{ id: string; brand: string; last4: string; expMonth?: number; expYear?: number; isDefault?: boolean }> }));
    return { clientSecret: intent.client_secret, savedMethods: [...(saved.methods || [])],
      amountCents,
      remainingBalanceCents: remaining - amountCents,
     };
  } catch (error) {
    console.error('Unable to create software balance payment:', error);
    return { error: 'Unable to start the balance payment. Please try again.' };
  }
}

export async function updateSoftwareBillingProfile(formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to update software billing details.' } as const;
  const fields = [
    'fullName', 'phone', 'companyName', 'billingName', 'billingLine1', 'billingLine2',
    'billingCity', 'billingState', 'billingPostal', 'billingCountry', 'shippingName',
    'shippingLine1', 'shippingLine2', 'shippingCity', 'shippingState', 'shippingPostal',
    'shippingCountry',
  ] as const;
  const values = Object.fromEntries(fields.map((field) => {
    const raw = formData.get(field);
    return [field, typeof raw === 'string' ? raw.trim() : ''];
  })) as Omit<SoftwareBillingProfile, 'shippingSameAsBilling'>;
  if (Object.values(values).some((value) => value.length > 160)) {
    return { error: 'Each billing detail must be 160 characters or fewer.' } as const;
  }
  for (const country of [values.billingCountry, values.shippingCountry]) {
    if (country && !/^[a-z]{2}$/i.test(country)) return { error: 'Enter a two-letter country code.' } as const;
  }
  const profile: SoftwareBillingProfile = {
    ...values,
    shippingSameAsBilling: formData.get('shippingSameAsBilling') === 'on',
  };
  try {
    await throttle(`software-profile:${user.id}`, 20);
    await persistSoftwareBillingProfile(user.id, profile);
    await syncSoftwareCustomerProfile(user.id, profile);
    revalidatePath('/software/account');
    return { success: true, message: 'Software billing details saved.' } as const;
  } catch (error) {
    console.error('Unable to save software billing profile:', error);
    return { error: 'Unable to save software billing details.' } as const;
  }
}

export async function listSoftwarePaymentMethods() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage software payment methods.' } as const;
  try {
    const customer = await softwareCustomer(user.id);
    if (!customer) return { methods: [] as Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean }> } as const;
    const stripe = await verifiedStripe();
    const record = await stripe.customers.retrieve(customer);
    assertCustomerMatchesScope(record, 'software', user.id);
    const defaultValue = record.invoice_settings?.default_payment_method;
    const defaultId = typeof defaultValue === 'string' ? defaultValue : defaultValue?.id;
    const methods = [];
    for await (const method of stripe.paymentMethods.list({ customer, type: 'card', limit: 100 })) {
      methods.push({
        id: method.id,
        brand: method.card?.brand || 'card',
        last4: method.card?.last4 || '••••',
        expMonth: method.card?.exp_month || 0,
        expYear: method.card?.exp_year || 0,
        isDefault: method.id === defaultId,
      });
    }
    methods.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { methods } as const;
  } catch (error) {
    console.error('Unable to list software payment methods:', error);
    return { error: 'Software payment methods are temporarily unavailable.' } as const;
  }
}

export async function prepareSoftwareCardUpdate() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage software payment methods.' } as const;
  try {
    await throttle(`software-payment-method:${user.id}`, 10);
    const customer = await softwareCustomer(user.id, true);
    if (!customer) throw new Error('Software billing account unavailable.');
    const stripe = await verifiedStripe();
    const setup = await stripe.setupIntents.create({
      customer,
      usage: 'off_session',
      allowed_payment_method_types: ['card'],
      metadata: { app: 'onefin-software-store', billing_scope: 'software', flow: 'software-card', user_id: user.id },
    }, { idempotencyKey: `software-card:${user.id}:${randomUUID()}` });
    if (!setup.client_secret || !stripeObjectMatchesMode(setup.livemode)) throw new Error('Software card setup unavailable.');
    return { clientSecret: setup.client_secret } as const;
  } catch (error) {
    console.error('Unable to prepare software payment method:', error);
    return { error: 'Unable to prepare secure card setup.' } as const;
  }
}

export async function saveSoftwareCard(setupIntentId: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage software payment methods.' } as const;
  if (!/^seti_[a-zA-Z0-9]+$/.test(setupIntentId)) return { error: 'Invalid card setup reference.' } as const;
  try {
    const customer = await softwareCustomer(user.id);
    const stripe = await verifiedStripe();
    if (!customer) throw new Error('Software card verification failed.');
    const setup = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
    assertSetupIntentOwnedByCustomer(setup, customer);
    const setupMetadata = setup.metadata || {};
    if (
      setupMetadata.app !== 'onefin-software-store' ||
      setupMetadata.billing_scope !== 'software' ||
      setupMetadata.flow !== 'software-card' ||
      setupMetadata.user_id !== user.id
    ) {
      throw new Error('Software card verification failed.');
    }
    const methodId = stripePaymentMethodId(setup.payment_method);
    if (!methodId) throw new Error('Software card verification failed.');
    const savedMethod = await requireOwnedPaymentMethod(stripe, customer, methodId);
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: savedMethod.id } });
    revalidatePath('/software/account');
    return { success: true } as const;
  } catch (error) {
    console.error('Unable to save software payment method:', error);
    return { error: 'Unable to verify and save this card.' } as const;
  }
}

export async function setSoftwareDefaultPaymentMethod(paymentMethodIdValue: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage software payment methods.' } as const;
  if (!/^pm_[a-zA-Z0-9]+$/.test(paymentMethodIdValue)) return { error: 'Invalid payment method.' } as const;
  try {
    const customer = await softwareCustomer(user.id);
    if (!customer) return { error: 'No software payment method is saved.' } as const;
    const stripe = await verifiedStripe();
    const record = await stripe.customers.retrieve(customer);
    assertCustomerMatchesScope(record, 'software', user.id);
    const method = await requireOwnedPaymentMethod(stripe, customer, paymentMethodIdValue);
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: method.id } });
    revalidatePath('/software/account');
    return { success: true, message: 'Default software payment method updated.' } as const;
  } catch (error) {
    console.error('Unable to set software default payment method:', error);
    return { error: error instanceof Error ? error.message : 'Unable to update the default card.' } as const;
  }
}


export async function removeSoftwarePaymentMethod(paymentMethodIdValue: string) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage software payment methods.' } as const;
  if (!/^pm_[a-zA-Z0-9]+$/.test(paymentMethodIdValue)) return { error: 'Invalid payment method.' } as const;
  try {
    const customer = await softwareCustomer(user.id);
    if (!customer) return { error: 'No software payment method is saved.' } as const;
    const stripe = await verifiedStripe();
    const record = await stripe.customers.retrieve(customer);
    assertCustomerMatchesScope(record, 'software', user.id);
    const method = await requireOwnedPaymentMethod(stripe, customer, paymentMethodIdValue);
    const defaultValue = record.invoice_settings?.default_payment_method;
    const defaultId = typeof defaultValue === 'string' ? defaultValue : defaultValue?.id;
    if (defaultId === method.id) return { error: 'Set another default card before removing this one.' } as const;
    await stripe.paymentMethods.detach(method.id);
    revalidatePath('/software/account');
    return { success: true, message: 'Software payment method removed.' } as const;
  } catch (error) {
    console.error('Unable to remove software payment method:', error);
    return { error: error instanceof Error ? error.message : 'Unable to remove this card.' } as const;
  }
}

/** Pay outstanding balance on an existing software purchase (partial → more payments). */
export async function createSoftwareRemainingPaymentIntent(input: {
  purchaseId: string;
  /** Optional override amount in dollars; defaults to full remaining balance. */
  amount?: string;
  savePaymentMethod?: boolean;
  paymentMethodId?: string | null;
}): Promise<{
  clientSecret?: string;
  error?: string;
  amountCents?: number;
  remainingBalanceCents?: number;
  agreedPriceCents?: number;
  amountPaidCents?: number;
  savedMethods?: Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }>;
}> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to continue.' };
  if (!input?.purchaseId || !uuid.test(input.purchaseId)) {
    return { error: 'Invalid purchase.' };
  }

  try {
    await throttle(`software-remaining:${user.id}`, 10);
    const [purchase] = await query<{
      id: string;
      user_id: string;
      item_kind: string;
      item_id: string;
      item_name: string;
      amount_paid_cents: number;
      total_price_cents: number;
      status: string;
      currency: string;
    }>(
      `select id, user_id, item_kind, item_id, item_name, amount_paid_cents, total_price_cents, status, currency
       from software_storefront_purchases where id=$1`,
      [input.purchaseId],
    );
    if (!purchase || purchase.user_id !== user.id) return { error: 'Purchase not found.' };
    if (purchase.status === 'paid') return { error: 'This purchase is already paid in full.' };

    const agreed = Number(purchase.total_price_cents) || 0;
    const paid = Number(purchase.amount_paid_cents) || 0;
    const remaining = Math.max(0, agreed - paid);
    if (remaining <= 0) return { error: 'No outstanding balance on this purchase.' };

    let amountCents = remaining;
    if (input.amount != null && String(input.amount).trim() !== '') {
      const parsed = parseSoftwarePaymentAmount(String(input.amount), remaining, remaining < 500 ? remaining : 500);
      if (parsed == null) {
        return { error: `Choose an amount from $5.00 up to $${(remaining / 100).toFixed(2)}.` };
      }
      amountCents = parsed;
    }
    if (amountCents > remaining) {
      return { error: `Amount exceeds the outstanding balance of $${(remaining / 100).toFixed(2)}.` };
    }

    const customer = await softwareCustomer(user.id, true);
    if (!customer) return { error: 'Software billing account unavailable.' };
    const stripe = await verifiedStripe();

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: (purchase.currency || 'usd').toLowerCase(),
      customer,
      receipt_email: user.email,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      setup_future_usage: input.savePaymentMethod === false ? undefined : 'off_session',
      metadata: {
        app: 'onefin-software-store',
        billing_scope: 'software',
        flow: 'software-remaining-balance',
        user_id: user.id,
        purchase_id: purchase.id,
        item_kind: purchase.item_kind,
        item_id: purchase.item_id,
        agreed_price_cents: String(agreed),
        amount_cents: String(amountCents),
      },
      description: `Software remaining balance · ${purchase.item_name} · $${(amountCents / 100).toFixed(2)}`,
    });

    if (!intent.client_secret) return { error: 'Unable to start payment.' };

    // Optional: confirm immediately with saved method
    if (input.paymentMethodId && input.paymentMethodId.startsWith('pm_')) {
      const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
      if (pm.customer !== customer) {
        return { error: 'Payment method is not saved on your Software account.' };
      }
      const confirmed = await stripe.paymentIntents.confirm(intent.id, {
        payment_method: input.paymentMethodId,
              });
      if (confirmed.status === 'requires_action') {
        return {
          clientSecret: confirmed.client_secret || intent.client_secret,
          amountCents,
          remainingBalanceCents: remaining,
          agreedPriceCents: agreed,
          amountPaidCents: paid,
        };
      }
      if (confirmed.status !== 'succeeded') {
        return { error: `Payment status: ${confirmed.status}` };
      }
      // Fulfillment via webhook; still return client secret for verify path
      return {
        clientSecret: confirmed.client_secret || intent.client_secret,
        amountCents,
        remainingBalanceCents: remaining - amountCents,
        agreedPriceCents: agreed,
        amountPaidCents: paid,
      };
    }

    const methods = await listSoftwarePaymentMethods();
    return {
      clientSecret: intent.client_secret,
      amountCents,
      remainingBalanceCents: remaining,
      agreedPriceCents: agreed,
      amountPaidCents: paid,
      savedMethods: methods.methods || [],
    };
  } catch (error) {
    console.error('createSoftwareRemainingPaymentIntent failed', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to start remaining balance payment.',
    };
  }
}

export async function confirmSoftwarePaymentWithSavedMethod(input: {
  clientSecret: string;
  paymentMethodId: string;
  purchaseId: string;
}): Promise<{ error?: string; ok?: true; status?: string; clientSecret?: string }> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to continue.' };
  if (!input?.paymentMethodId?.startsWith('pm_') || !input.clientSecret) {
    return { error: 'Invalid payment request.' };
  }
  try {
    const stripe = await verifiedStripe();
    const intentId = input.clientSecret.split('_secret')[0];
    if (!intentId.startsWith('pi_')) return { error: 'Invalid payment intent.' };
    const customer = await softwareCustomer(user.id, false);
    if (!customer) return { error: 'Software billing account unavailable.' };
    const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
    if (pm.customer !== customer) {
      return { error: 'Payment method is not saved on your Software account.' };
    }
    const confirmed = await stripe.paymentIntents.confirm(intentId, {
      payment_method: input.paymentMethodId,
          });
    if (confirmed.status === 'requires_action') {
      return {
        error: 'additional_action_required',
        status: confirmed.status,
        clientSecret: confirmed.client_secret || input.clientSecret,
      };
    }
    if (confirmed.status !== 'succeeded') {
      return { error: `Payment status: ${confirmed.status}`, status: confirmed.status };
    }
    await stripe.customers
      .update(customer, { invoice_settings: { default_payment_method: input.paymentMethodId } })
      .catch(() => undefined);
    revalidatePath('/software/account');
    return { ok: true, status: confirmed.status };
  } catch (error) {
    console.error('confirmSoftwarePaymentWithSavedMethod failed', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to confirm payment.',
    };
  }
}


