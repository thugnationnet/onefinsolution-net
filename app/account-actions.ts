'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/session';
import {
  readPreferences,
  readProfile,
  updateProfileDetails,
  writePreferences,
  writeWorkspacePreferences,
} from '@/lib/account-service';
import {
  parsePreferences,
  type AccountPreferences,
} from '@/lib/account-preferences';
import { changePassword, throttle } from '@/lib/auth-service';
import { listPaymentMethodsAction } from '@/app/payment-method-actions';
import { availableModels } from '@/lib/models';
import { updateWorkspaceBillingProfile } from '@/lib/workspace-billing-profile';
import { syncWorkspaceCustomerProfile } from '@/lib/workspace-stripe';
import {
  getSubscriptionDetails,
  getUserModelSettings,
} from '@/app/actions';

function clean(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function getAccountDashboardDataAction() {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in.' } as const;

  const [profile, preferences, paymentMethods, modelSettings, subscription] = await Promise.all([
    readProfile(user.id),
    readPreferences(user.id),
    listPaymentMethodsAction().catch(() => ({ error: 'Unable to load payment methods.' as const })),
    getUserModelSettings().catch(() => ({ enabledModels: availableModels.map((m) => m.id) })),
    getSubscriptionDetails().catch(() => null),
  ]);

  const enabledModels =
    modelSettings && 'enabledModels' in modelSettings && Array.isArray(modelSettings.enabledModels)
      ? (modelSettings.enabledModels as string[])
      : availableModels.map((m) => m.id);

  return {
    profile:
      profile || {
        id: user.id,
        email: user.email,
        name: null,
        fullName: null,
        phone: null,
        companyName: null,
        billingName: null,
        billingLine1: null,
        billingLine2: null,
        billingCity: null,
        billingState: null,
        billingPostal: null,
        billingCountry: null,
        shippingName: null,
        shippingLine1: null,
        shippingLine2: null,
        shippingCity: null,
        shippingState: null,
        shippingPostal: null,
        shippingCountry: null,
        shippingSameAsBilling: true,
        emailVerifiedAt: user.email_verified_at,
        createdAt: null,
      },
    preferences,
    subscription,
    paymentMethods: 'error' in paymentMethods ? { error: paymentMethods.error } : paymentMethods,
    modules: availableModels.map((model) => ({
      id: model.id,
      name: model.name,
      description: 'Chat model available in One Fin.',
      enabled: enabledModels.includes(model.id),
    })),
  } as const;
}

export async function updateAccountProfileAction(formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in.' } as const;
  try {
    await throttle(`profile:${user.id}`, 20);
    await updateProfileDetails(user.id, {
      fullName: clean(formData.get('fullName')) || null,
      phone: clean(formData.get('phone')) || null,
      companyName: clean(formData.get('companyName')) || null,
      billingName: clean(formData.get('billingName')) || null,
      billingLine1: clean(formData.get('billingLine1')) || null,
      billingLine2: clean(formData.get('billingLine2')) || null,
      billingCity: clean(formData.get('billingCity')) || null,
      billingState: clean(formData.get('billingState')) || null,
      billingPostal: clean(formData.get('billingPostal')) || null,
      billingCountry: clean(formData.get('billingCountry')) || null,
      shippingName: clean(formData.get('shippingName')) || null,
      shippingLine1: clean(formData.get('shippingLine1')) || null,
      shippingLine2: clean(formData.get('shippingLine2')) || null,
      shippingCity: clean(formData.get('shippingCity')) || null,
      shippingState: clean(formData.get('shippingState')) || null,
      shippingPostal: clean(formData.get('shippingPostal')) || null,
      shippingCountry: clean(formData.get('shippingCountry')) || null,
      shippingSameAsBilling:
        formData.get('shippingSameAsBilling') === 'on' || formData.get('shippingSameAsBilling') === 'true',
    });
    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath('/dashboard');
    return { success: true as const, message: 'Account details saved.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to save account details right now.',
    } as const;
  }
}

export async function updateAccountPasswordAction(formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in.' } as const;
  const currentPassword = clean(formData.get('currentPassword'));
  const nextPassword = clean(formData.get('nextPassword'));
  const confirmPassword = clean(formData.get('confirmPassword'));
  if (!currentPassword || !nextPassword) return { error: 'Enter your current and new password.' } as const;
  if (nextPassword !== confirmPassword) return { error: 'New password confirmation does not match.' } as const;
  try {
    await throttle(`password:${user.id}`, 8);
    await changePassword(user.id, currentPassword, nextPassword);
    return { success: true as const, message: 'Password updated. Sign in again with your new password.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to update password right now.',
    } as const;
  }
}

export async function savePreferencesAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  try {
    const next = parsePreferences(formData);
    await writePreferences(user.id, next);
    revalidatePath('/account');
    revalidatePath('/account/preferences');
  } catch {
    /* form validation errors surface via revalidation/empty state */
  }
}

export async function updateWorkspaceBillingProfileAction(formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to update Workspace billing details.' } as const;
  try {
    await throttle(`workspace-profile:${user.id}`, 20);
    const fields = [
      'fullName', 'phone', 'companyName', 'billingName', 'billingLine1', 'billingLine2',
      'billingCity', 'billingState', 'billingPostal', 'billingCountry', 'shippingName',
      'shippingLine1', 'shippingLine2', 'shippingCity', 'shippingState', 'shippingPostal', 'shippingCountry',
    ] as const;
    const values = Object.fromEntries(fields.map((field) => [field, clean(formData.get(field))]));
    if (Object.values(values).some((value) => value.length > 200)) {
      return { error: 'Please keep each billing detail under 200 characters.' } as const;
    }
    const shippingSameAsBilling = formData.get('shippingSameAsBilling') === 'on';
    for (const country of [values.billingCountry, shippingSameAsBilling ? values.billingCountry : values.shippingCountry]) {
      if (country && !/^[A-Za-z]{2}$/.test(country)) {
        return { error: 'Enter country as a two-letter ISO code, such as US or GB.' } as const;
      }
    }
    const profile = {
      fullName: values.fullName,
      phone: values.phone,
      companyName: values.companyName,
      billingName: values.billingName,
      billingLine1: values.billingLine1,
      billingLine2: values.billingLine2,
      billingCity: values.billingCity,
      billingState: values.billingState,
      billingPostal: values.billingPostal,
      billingCountry: values.billingCountry.toUpperCase(),
      shippingName: shippingSameAsBilling ? values.billingName : values.shippingName,
      shippingLine1: shippingSameAsBilling ? values.billingLine1 : values.shippingLine1,
      shippingLine2: shippingSameAsBilling ? values.billingLine2 : values.shippingLine2,
      shippingCity: shippingSameAsBilling ? values.billingCity : values.shippingCity,
      shippingState: shippingSameAsBilling ? values.billingState : values.shippingState,
      shippingPostal: shippingSameAsBilling ? values.billingPostal : values.shippingPostal,
      shippingCountry: (shippingSameAsBilling ? values.billingCountry : values.shippingCountry).toUpperCase(),
      shippingSameAsBilling,
    };
    await updateWorkspaceBillingProfile(user.id, profile);
    revalidatePath('/account');
    try {
      await syncWorkspaceCustomerProfile(user.id, profile);
    } catch (error) {
      console.error('Workspace profile saved but Stripe customer sync failed:', error);
      return {
        success: true,
        message: 'Workspace details were saved, but the payment profile could not be synchronized. Please save again to retry.',
      } as const;
    }
    return { success: true, message: 'Workspace billing details saved.' } as const;
  } catch (error) {
    console.error('Unable to save Workspace billing details:', error);
    return { error: 'Unable to save Workspace billing details right now.' } as const;
  }
}

export async function saveWorkspacePreferencesAction(formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to update Workspace preferences.' } as const;
  try {
    await throttle(`workspace-prefs:${user.id}`, 20);
    const next: AccountPreferences = parsePreferences(formData);
    await writeWorkspacePreferences(user.id, next);
    revalidatePath('/account');
    revalidatePath('/account/preferences');
    revalidatePath('/workspace');
    return { success: true as const, message: 'Workspace preferences saved.' };
  } catch (error) {
    console.error('Unable to save Workspace preferences:', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to save Workspace preferences right now.',
    } as const;
  }
}
