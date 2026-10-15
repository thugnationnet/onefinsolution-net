import 'server-only';
import Stripe from 'stripe';
import { query } from '@/lib/db';
import { verifiedStripe } from '@/lib/stripe';
import { assertCustomerMatchesScope, billingCustomerMetadata } from '@/lib/billing-scope';
import { readSoftwareBillingProfile, type SoftwareBillingProfile } from '@/lib/software-billing-profile';
import { stripeObjectMatchesMode } from '@/lib/billing-environment';

function billingAddress(profile: SoftwareBillingProfile) {
  return {
    line1: profile.billingLine1 || undefined,
    line2: profile.billingLine2 || undefined,
    city: profile.billingCity || undefined,
    state: profile.billingState || undefined,
    postal_code: profile.billingPostal || undefined,
    country: profile.billingCountry || undefined,
  };
}

function shippingAddress(profile: SoftwareBillingProfile) {
  return {
    line1: profile.shippingLine1 || undefined,
    line2: profile.shippingLine2 || undefined,
    city: profile.shippingCity || undefined,
    state: profile.shippingState || undefined,
    postal_code: profile.shippingPostal || undefined,
    country: profile.shippingCountry || undefined,
  };
}

export async function softwareCustomer(userId: string, create = false): Promise<string | null> {
  const [mapping] = await query<{ customer_id: string }>(
    'select customer_id from software_billing_customers where user_id=$1',
    [userId],
  );
  if (mapping) {
    const stripe = await verifiedStripe();
    const existing = await stripe.customers.retrieve(mapping.customer_id);
    assertCustomerMatchesScope(existing, 'software', userId);
    return mapping.customer_id;
  }
  if (!create) return null;

  const [user] = await query<{ email: string }>('select email from app_users where id=$1', [userId]);
  if (!user) throw new Error('Software account is unavailable.');
  const profile = await readSoftwareBillingProfile(userId);
  const address = billingAddress(profile);
  const shipping = shippingAddress(profile);
  const stripe = await verifiedStripe();
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: profile.billingName || profile.fullName || undefined,
      phone: profile.phone || undefined,
      address: Object.values(address).some(Boolean) ? address : undefined,
      shipping: !profile.shippingSameAsBilling && Object.values(shipping).some(Boolean)
        ? { name: profile.shippingName || profile.fullName || 'Software customer', address: shipping }
        : undefined,
      metadata: billingCustomerMetadata('software', userId),
    },
    { idempotencyKey: `software-customer:${userId}` },
  );
  if (!stripeObjectMatchesMode(customer.livemode)) throw new Error('Software Stripe customer mode mismatch.');

  await query(
    `insert into software_billing_customers(user_id,customer_id)
     values($1,$2) on conflict(user_id) do nothing`,
    [userId, customer.id],
  );
  const [saved] = await query<{ customer_id: string }>(
    'select customer_id from software_billing_customers where user_id=$1',
    [userId],
  );
  if (saved?.customer_id !== customer.id) throw new Error('Software billing account conflict.');
  return customer.id;
}

export async function syncSoftwareCustomerProfile(userId: string, profile: SoftwareBillingProfile) {
  const customerId = await softwareCustomer(userId);
  if (!customerId) return;
  const stripe = await verifiedStripe();
  const address = billingAddress(profile);
  const shipping = shippingAddress(profile);
  const hasShipping = !profile.shippingSameAsBilling && Object.values(shipping).some(Boolean);
  const customer: Stripe.Customer = await stripe.customers.update(customerId, {
    name: profile.billingName || profile.fullName || '',
    phone: profile.phone || '',
    address: Object.values(address).some(Boolean) ? address : '',
    shipping: hasShipping
      ? { name: profile.shippingName || profile.fullName || 'Software customer', address: shipping }
      : '',
  });
  if (!stripeObjectMatchesMode(customer.livemode)) throw new Error('Software Stripe customer mode mismatch.');
}
