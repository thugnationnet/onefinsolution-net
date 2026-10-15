import 'server-only';
import { query } from './db';

export type WorkspaceBillingProfile = {
  fullName: string;
  phone: string;
  companyName: string;
  billingName: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingPostal: string;
  billingCountry: string;
  shippingName: string;
  shippingLine1: string;
  shippingLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingPostal: string;
  shippingCountry: string;
  shippingSameAsBilling: boolean;
};

const profileFields = [
  'full_name',
  'phone',
  'company_name',
  'billing_name',
  'billing_line1',
  'billing_line2',
  'billing_city',
  'billing_state',
  'billing_postal',
  'billing_country',
  'shipping_name',
  'shipping_line1',
  'shipping_line2',
  'shipping_city',
  'shipping_state',
  'shipping_postal',
  'shipping_country',
] as const;

type WorkspaceBillingProfileRow = Record<(typeof profileFields)[number], string | null> & {
  shipping_same_as_billing: boolean;
};

const emptyWorkspaceBillingProfile: WorkspaceBillingProfile = {
  fullName: '',
  phone: '',
  companyName: '',
  billingName: '',
  billingLine1: '',
  billingLine2: '',
  billingCity: '',
  billingState: '',
  billingPostal: '',
  billingCountry: '',
  shippingName: '',
  shippingLine1: '',
  shippingLine2: '',
  shippingCity: '',
  shippingState: '',
  shippingPostal: '',
  shippingCountry: '',
  shippingSameAsBilling: true,
};

export async function readWorkspaceBillingProfile(userId: string): Promise<WorkspaceBillingProfile> {
  const [row] = await query<WorkspaceBillingProfileRow>(
    `select ${profileFields.join(',')}, shipping_same_as_billing
     from workspace_billing_profiles where user_id=$1`,
    [userId],
  );
  if (!row) return { ...emptyWorkspaceBillingProfile };
  return {
    fullName: row.full_name || '',
    phone: row.phone || '',
    companyName: row.company_name || '',
    billingName: row.billing_name || '',
    billingLine1: row.billing_line1 || '',
    billingLine2: row.billing_line2 || '',
    billingCity: row.billing_city || '',
    billingState: row.billing_state || '',
    billingPostal: row.billing_postal || '',
    billingCountry: row.billing_country || '',
    shippingName: row.shipping_name || '',
    shippingLine1: row.shipping_line1 || '',
    shippingLine2: row.shipping_line2 || '',
    shippingCity: row.shipping_city || '',
    shippingState: row.shipping_state || '',
    shippingPostal: row.shipping_postal || '',
    shippingCountry: row.shipping_country || '',
    shippingSameAsBilling: row.shipping_same_as_billing,
  };
}

export async function updateWorkspaceBillingProfile(
  userId: string,
  profile: WorkspaceBillingProfile,
): Promise<void> {
  await query(
    `insert into workspace_billing_profiles(
       user_id,full_name,phone,company_name,
       billing_name,billing_line1,billing_line2,billing_city,billing_state,billing_postal,billing_country,
       shipping_name,shipping_line1,shipping_line2,shipping_city,shipping_state,shipping_postal,shipping_country,
       shipping_same_as_billing,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
     on conflict(user_id) do update set
       full_name=excluded.full_name,phone=excluded.phone,company_name=excluded.company_name,
       billing_name=excluded.billing_name,billing_line1=excluded.billing_line1,billing_line2=excluded.billing_line2,
       billing_city=excluded.billing_city,billing_state=excluded.billing_state,billing_postal=excluded.billing_postal,
       billing_country=excluded.billing_country,shipping_name=excluded.shipping_name,
       shipping_line1=excluded.shipping_line1,shipping_line2=excluded.shipping_line2,shipping_city=excluded.shipping_city,
       shipping_state=excluded.shipping_state,shipping_postal=excluded.shipping_postal,
       shipping_country=excluded.shipping_country,shipping_same_as_billing=excluded.shipping_same_as_billing,
       updated_at=now()`,
    [
      userId,
      profile.fullName,
      profile.phone,
      profile.companyName,
      profile.billingName,
      profile.billingLine1,
      profile.billingLine2,
      profile.billingCity,
      profile.billingState,
      profile.billingPostal,
      profile.billingCountry,
      profile.shippingName,
      profile.shippingLine1,
      profile.shippingLine2,
      profile.shippingCity,
      profile.shippingState,
      profile.shippingPostal,
      profile.shippingCountry,
      profile.shippingSameAsBilling,
    ],
  );
}
