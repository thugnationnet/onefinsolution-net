import 'server-only';
import { query } from '@/lib/db';

export type SoftwareBillingProfile = {
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

type ProfileColumn =
  | 'full_name'
  | 'phone'
  | 'company_name'
  | 'billing_name'
  | 'billing_line1'
  | 'billing_line2'
  | 'billing_city'
  | 'billing_state'
  | 'billing_postal'
  | 'billing_country'
  | 'shipping_name'
  | 'shipping_line1'
  | 'shipping_line2'
  | 'shipping_city'
  | 'shipping_state'
  | 'shipping_postal'
  | 'shipping_country';

const columns: ProfileColumn[] = [
  'full_name', 'phone', 'company_name', 'billing_name', 'billing_line1', 'billing_line2',
  'billing_city', 'billing_state', 'billing_postal', 'billing_country', 'shipping_name',
  'shipping_line1', 'shipping_line2', 'shipping_city', 'shipping_state', 'shipping_postal',
  'shipping_country',
];

export const emptySoftwareBillingProfile: SoftwareBillingProfile = {
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

const propertyByColumn: Record<ProfileColumn, keyof SoftwareBillingProfile> = {
  full_name: 'fullName',
  phone: 'phone',
  company_name: 'companyName',
  billing_name: 'billingName',
  billing_line1: 'billingLine1',
  billing_line2: 'billingLine2',
  billing_city: 'billingCity',
  billing_state: 'billingState',
  billing_postal: 'billingPostal',
  billing_country: 'billingCountry',
  shipping_name: 'shippingName',
  shipping_line1: 'shippingLine1',
  shipping_line2: 'shippingLine2',
  shipping_city: 'shippingCity',
  shipping_state: 'shippingState',
  shipping_postal: 'shippingPostal',
  shipping_country: 'shippingCountry',
};

type SoftwareBillingProfileRow = Record<ProfileColumn, string | null> & {
  shipping_same_as_billing: boolean;
};

export async function readSoftwareBillingProfile(userId: string): Promise<SoftwareBillingProfile> {
  const [row] = await query<SoftwareBillingProfileRow>(
    `select ${columns.join(',')}, shipping_same_as_billing
     from software_billing_profiles where user_id=$1`,
    [userId],
  );
  if (!row) return { ...emptySoftwareBillingProfile };
  const values: Partial<SoftwareBillingProfile> = Object.fromEntries(
    columns.map((column) => [propertyByColumn[column], row[column] || '']),
  );
  return {
    ...emptySoftwareBillingProfile,
    ...values,
    shippingSameAsBilling: row.shipping_same_as_billing,
  };
}

export async function updateSoftwareBillingProfile(userId: string, profile: SoftwareBillingProfile) {
  const values = columns.map((column) => profile[propertyByColumn[column]]);
  await query(
    `insert into software_billing_profiles (
       user_id,${columns.join(',')},shipping_same_as_billing,updated_at
     ) values ($1,${columns.map((_, index) => `$${index + 2}`).join(',')},$${columns.length + 2},now())
     on conflict(user_id) do update set
       ${columns.map((column) => `${column}=excluded.${column}`).join(',')},
       shipping_same_as_billing=excluded.shipping_same_as_billing,updated_at=now()`,
    [userId, ...values, profile.shippingSameAsBilling],
  );
}
