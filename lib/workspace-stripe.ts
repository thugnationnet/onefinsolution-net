import 'server-only';
import { query } from './db';
import { verifiedStripe } from './stripe';
import { assertCustomerMatchesScope, billingCustomerMetadata } from './billing-scope';
import { readWorkspaceBillingProfile, type WorkspaceBillingProfile } from './workspace-billing-profile';

function billingAddress(profile: WorkspaceBillingProfile) {
  return {
    line1: profile.billingLine1 || undefined,
    line2: profile.billingLine2 || undefined,
    city: profile.billingCity || undefined,
    state: profile.billingState || undefined,
    postal_code: profile.billingPostal || undefined,
    country: profile.billingCountry || undefined,
  };
}

function shippingAddress(profile: WorkspaceBillingProfile) {
  return {
    line1: profile.shippingLine1 || undefined,
    line2: profile.shippingLine2 || undefined,
    city: profile.shippingCity || undefined,
    state: profile.shippingState || undefined,
    postal_code: profile.shippingPostal || undefined,
    country: profile.shippingCountry || undefined,
  };
}

export async function workspaceCustomer(userId: string, create = false): Promise<string | null> {
  const [mapping] = await query<{ customer_id: string }>(
    'select customer_id from workspace_billing_customers where user_id=$1',
    [userId],
  );
  if (mapping) {
    const stripe = await verifiedStripe();
    const existing = await stripe.customers.retrieve(mapping.customer_id);
    assertCustomerMatchesScope(existing, 'workspace', userId);
    return mapping.customer_id;
  }
  if (!create) return null;

  const [user] = await query<{ email: string }>('select email from app_users where id=$1', [userId]);
  if (!user) throw new Error('Workspace account is unavailable.');

  const profile = await readWorkspaceBillingProfile(userId);
  const address = billingAddress(profile);
  const hasAddress = Object.values(address).some(Boolean);
  const shipping = shippingAddress(profile);
  const shippingName = profile.shippingName || profile.fullName || profile.billingName;
  const hasShipping = Object.values(shipping).some(Boolean) && Boolean(shippingName);
  const stripe = await verifiedStripe();
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: profile.billingName || profile.fullName || undefined,
      phone: profile.phone || undefined,
      address: hasAddress ? address : undefined,
      shipping: hasShipping
        ? {
            name: shippingName || 'Workspace billing contact',
            phone: profile.phone || undefined,
            address: shipping,
          }
        : undefined,
      metadata: billingCustomerMetadata('workspace', userId),
    },
    { idempotencyKey: `workspace-customer:${userId}` },
  );

  await query(
    `insert into workspace_billing_customers(user_id, customer_id)
     values($1, $2) on conflict(user_id) do nothing`,
    [userId, customer.id],
  );
  const [saved] = await query<{ customer_id: string }>(
    'select customer_id from workspace_billing_customers where user_id=$1',
    [userId],
  );
  if (saved?.customer_id !== customer.id) throw new Error('Workspace billing account conflict.');
  return customer.id;
}

export async function syncWorkspaceCustomerProfile(
  userId: string,
  profile: WorkspaceBillingProfile,
): Promise<void> {
  const customer = await workspaceCustomer(userId);
  if (!customer) return;
  const stripe = await verifiedStripe();
  const address = billingAddress(profile);
  const hasAddress = Object.values(address).some(Boolean);
  const shipping = shippingAddress(profile);
  const shippingName = profile.shippingName || profile.fullName || profile.billingName;
  const hasShipping = Object.values(shipping).some(Boolean) && Boolean(shippingName);
  await stripe.customers.update(customer, {
    name: profile.billingName || profile.fullName || '',
    phone: profile.phone || '',
    address: hasAddress ? address : '',
    shipping: hasShipping
      ? {
          name: shippingName || 'Workspace billing contact',
          phone: profile.phone || '',
          address: shipping,
        }
      : '',
  });
}
