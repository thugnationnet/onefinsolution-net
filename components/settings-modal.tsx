'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, CreditCard, Puzzle, UserRound, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getAccountDashboardDataAction,
  updateAccountPasswordAction,
  updateAccountProfileAction,
} from '@/app/account-actions';
import {
  cancelSubscriptionAction,
  updateUserModelSettings,
} from '@/app/actions';
import { PaymentMethodsPanel } from '@/components/payment-methods-panel';
import { PlanSwitcher } from '@/components/plan-switcher';
import { availableModels } from '@/lib/models';

type DashboardData = Exclude<Awaited<ReturnType<typeof getAccountDashboardDataAction>>, { error: string }>;

export function SettingsModal({
  isOpen,
  setIsOpen,
  onSettingsChanged,
  initialTab = 'account',
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSettingsChanged?: () => void | Promise<void>;
  initialTab?: 'account' | 'modules' | 'subscriptions';
}) {
  const onClose = () => setIsOpen(false);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [enabledModels, setEnabledModels] = useState<string[]>(availableModels.map((m) => m.id));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getAccountDashboardDataAction();
    if ('error' in result && result.error && !('profile' in result)) {
      setError(result.error);
      setData(null);
      setLoading(false);
      return;
    }
    const dashboard = result as DashboardData;
    setData(dashboard);
    setSameAsBilling(dashboard.profile.shippingSameAsBilling !== false);
    setEnabledModels(dashboard.modules.filter((m) => m.enabled).map((m) => m.id));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setMessage(null);
    void load();
  }, [isOpen, initialTab, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  const profile = data?.profile;
  const subscription = data?.subscription as
    | {
        planName?: string | null;
        planKey?: string | null;
        subscriptionId?: string | null;
        status?: string | null;
        priceLabel?: string | null;
        scheduledPlanKey?: string | null;
        scheduledPlanName?: string | null;
        scheduledPriceLabel?: string | null;
        scheduledDate?: string | null;
        canUpgrade?: boolean;
        renewalDate?: string | null;
        isCancelled?: boolean;
        error?: string;
      }
    | null
    | undefined;

  async function onSaveProfile(formData: FormData) {
    setSavingProfile(true);
    setMessage(null);
    setError(null);
    formData.set('shippingSameAsBilling', sameAsBilling ? 'true' : 'false');
    const result = await updateAccountProfileAction(formData);
    if ('error' in result && result.error) setError(result.error);
    else {
      setMessage(result.message || 'Account details saved.');
      await onSettingsChanged?.();
    }
    await load();
    setSavingProfile(false);
  }

  async function onSavePassword(formData: FormData) {
    setSavingPassword(true);
    setMessage(null);
    setError(null);
    const result = await updateAccountPasswordAction(formData);
    if ('error' in result && result.error) setError(result.error);
    else setMessage(result.message || 'Password updated.');
    setSavingPassword(false);
  }

  async function onSaveModules() {
    setSavingModules(true);
    setMessage(null);
    setError(null);
    const result = await updateUserModelSettings(enabledModels);
    if (result && 'error' in result && result.error) setError(result.error);
    else {
      setMessage('Modules updated.');
      await onSettingsChanged?.();
      await load();
    }
    setSavingModules(false);
  }

  async function onCancelSubscription() {
    if (!subscription?.subscriptionId) return;
    setCanceling(true);
    setMessage(null);
    setError(null);
    const result = await cancelSubscriptionAction(subscription.subscriptionId);
    if (!result.success) setError(result.error || 'Unable to cancel subscription.');
    else {
      setMessage('Cancellation scheduled for the end of the current period.');
      await onSettingsChanged?.();
      await load();
    }
    setCanceling(false);
  }

  return (
    <div className="settings-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="settings-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Home Page Chat Plus settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div>
            <p className="settings-kicker">Home Page Chat Plus</p>
            <h2>Settings</h2>
            <p className="muted text-sm">
              Manage your Home Page Chat Plus profile, AI models, plan, and subscription payment methods.
            </p>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? <p className="settings-banner settings-banner-error">{error}</p> : null}
        {message ? <p className="settings-banner settings-banner-ok">{message}</p> : null}
        {loading && !data ? <p className="muted px-1 py-2 text-sm">Loading your dashboard…</p> : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="settings-tabs">
          <TabsList className="settings-tablist">
            <TabsTrigger value="account" className="settings-tab">
              <UserRound className="h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="modules" className="settings-tab">
              <Puzzle className="h-4 w-4" />
              AI models
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="settings-tab">
              <CreditCard className="h-4 w-4" />
              Plan & billing
            </TabsTrigger>
          </TabsList>

          <div className="settings-tab-body">
            <TabsContent value="account" className="settings-tab-content">
              <section className="settings-section">
                <div className="settings-section-head">
                  <h3>Profile</h3>
                  <p className="muted text-sm">Profile and billing details for your Home Page Chat Plus account.</p>
                </div>
                <form action={onSaveProfile} className="settings-form-grid">
                  <label className="field">
                    <span>Full name</span>
                    <input name="fullName" defaultValue={profile?.fullName || profile?.name || ''} placeholder="Your full name" />
                  </label>
                  <label className="field">
                    <span>Email address</span>
                    <input value={profile?.email || ''} readOnly disabled placeholder="you@example.com" />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input name="phone" defaultValue={profile?.phone || ''} placeholder="+1 555 000 0000" />
                  </label>
                  <label className="field">
                    <span>Company</span>
                    <input name="companyName" defaultValue={profile?.companyName || ''} placeholder="Company or team name" />
                  </label>

                  <div className="settings-subsection">
                    <h4>Billing details</h4>
                    <div className="settings-form-grid">
                      <label className="field">
                        <span>Billing name</span>
                        <input name="billingName" defaultValue={profile?.billingName || ''} placeholder="Name on invoices" />
                      </label>
                      <label className="field">
                        <span>Billing address line 1</span>
                        <input name="billingLine1" defaultValue={profile?.billingLine1 || ''} placeholder="Street address" />
                      </label>
                      <label className="field">
                        <span>Billing address line 2</span>
                        <input name="billingLine2" defaultValue={profile?.billingLine2 || ''} placeholder="Apt, suite, etc." />
                      </label>
                      <label className="field">
                        <span>City</span>
                        <input name="billingCity" defaultValue={profile?.billingCity || ''} placeholder="City" />
                      </label>
                      <label className="field">
                        <span>State / region</span>
                        <input name="billingState" defaultValue={profile?.billingState || ''} placeholder="State" />
                      </label>
                      <label className="field">
                        <span>Postal code</span>
                        <input name="billingPostal" defaultValue={profile?.billingPostal || ''} placeholder="Postal code" />
                      </label>
                      <label className="field">
                        <span>Country</span>
                        <input name="billingCountry" defaultValue={profile?.billingCountry || ''} placeholder="Country" />
                      </label>
                    </div>
                  </div>

                  <div className="settings-subsection">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4>Shipping address</h4>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={sameAsBilling}
                          onChange={(event) => setSameAsBilling(event.target.checked)}
                        />
                        Same as billing
                      </label>
                    </div>
                    {!sameAsBilling ? (
                      <div className="settings-form-grid">
                        <label className="field">
                          <span>Shipping name</span>
                          <input name="shippingName" defaultValue={profile?.shippingName || ''} placeholder="Recipient name" />
                        </label>
                        <label className="field">
                          <span>Shipping address line 1</span>
                          <input name="shippingLine1" defaultValue={profile?.shippingLine1 || ''} placeholder="Street address" />
                        </label>
                        <label className="field">
                          <span>Shipping address line 2</span>
                          <input name="shippingLine2" defaultValue={profile?.shippingLine2 || ''} placeholder="Apt, suite, etc." />
                        </label>
                        <label className="field">
                          <span>City</span>
                          <input name="shippingCity" defaultValue={profile?.shippingCity || ''} placeholder="City" />
                        </label>
                        <label className="field">
                          <span>State / region</span>
                          <input name="shippingState" defaultValue={profile?.shippingState || ''} placeholder="State" />
                        </label>
                        <label className="field">
                          <span>Postal code</span>
                          <input name="shippingPostal" defaultValue={profile?.shippingPostal || ''} placeholder="Postal code" />
                        </label>
                        <label className="field">
                          <span>Country</span>
                          <input name="shippingCountry" defaultValue={profile?.shippingCountry || ''} placeholder="Country" />
                        </label>
                      </div>
                    ) : (
                      <p className="muted text-sm">Shipping copies your billing address until you turn this off.</p>
                    )}
                  </div>

                  <div className="button-row">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? 'Saving…' : 'Save account details'}
                    </Button>
                  </div>
                </form>
              </section>

              <section className="settings-section">
                <div className="settings-section-head">
                  <h3 className="inline-flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Password & security
                  </h3>
                  <p className="muted text-sm">Change your password. Other sessions are signed out after a successful update.</p>
                </div>
                <form action={onSavePassword} className="settings-form-grid">
                  <label className="field">
                    <span>Current password</span>
                    <input name="currentPassword" type="password" autoComplete="current-password" required placeholder="Current password" />
                  </label>
                  <label className="field">
                    <span>New password</span>
                    <input name="nextPassword" type="password" autoComplete="new-password" required minLength={12} placeholder="At least 12 characters" />
                  </label>
                  <label className="field">
                    <span>Confirm new password</span>
                    <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} placeholder="Repeat new password" />
                  </label>
                  <div className="button-row">
                    <Button type="submit" variant="outline" disabled={savingPassword}>
                      {savingPassword ? 'Updating…' : 'Update password'}
                    </Button>
                  </div>
                </form>
              </section>

              <section className="settings-section">
                <PaymentMethodsPanel compact />
              </section>
            </TabsContent>

            <TabsContent value="modules" className="settings-tab-content">
              <section className="settings-section">
                <div className="settings-section-head">
                  <h3>AI models</h3>
                  <p className="muted text-sm">
                    Choose which AI models are available in Home Page Chat Plus. Disabled models stay hidden from chat selectors.
                  </p>
                </div>
                <ul className="settings-module-list">
                  {(data?.modules || availableModels.map((m) => ({ id: m.id, name: m.name, description: '', enabled: true }))).map(
                    (module) => {
                      const checked = enabledModels.includes(module.id);
                      return (
                        <li key={module.id} className="settings-module-item">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={(event) => {
                                setEnabledModels((current) => {
                                  if (event.target.checked) return Array.from(new Set([...current, module.id]));
                                  if (current.length <= 1) return current;
                                  return current.filter((id) => id !== module.id);
                                });
                              }}
                            />
                            <span>
                              <span className="block font-medium text-slate-900">{module.name}</span>
                              <span className="muted block text-sm">{module.description || module.id}</span>
                              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                {checked ? 'Enabled' : 'Disabled'}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    },
                  )}
                </ul>
                <div className="button-row mt-4">
                  <Button type="button" onClick={() => void onSaveModules()} disabled={savingModules || enabledModels.length === 0}>
                    {savingModules ? 'Saving…' : 'Save AI models'}
                  </Button>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="subscriptions" className="settings-tab-content">
              <section className="settings-section">
                <div className="settings-section-head">
                  <h3>Home Page Chat Plus plan</h3>
                  <p className="muted text-sm">Current plan, renewal status, and billing shortcuts.</p>
                </div>

                {subscription?.subscriptionId ? (
                  <>
                    <div className="settings-plan-card">
                      <div>
                        <p className="settings-plan-eyebrow">Current plan</p>
                        <h4 className="settings-plan-title">{subscription.planName || 'Active plan'}</h4>
                        <p className="settings-plan-detail">
                          Status: {subscription.status === 'trialing' ? 'Free trial' : subscription.status || 'Active'}
                        </p>
                        {subscription.priceLabel ? <p className="settings-plan-detail">{subscription.priceLabel}</p> : null}
                        {subscription.renewalDate ? (
                          <p className="settings-plan-detail">
                            {subscription.isCancelled ? 'Access ends' : subscription.status === 'trialing' ? 'Trial ends' : 'Next renewal'}{' '}
                            {new Date(subscription.renewalDate).toLocaleDateString()}
                          </p>
                        ) : null}
                        {subscription.scheduledPlanKey && subscription.scheduledPlanName ? (
                          <p className="settings-plan-scheduled" role="status">
                            Scheduled: {subscription.scheduledPlanName}
                            {subscription.scheduledPriceLabel ? ` · ${subscription.scheduledPriceLabel}` : ''}
                            {subscription.scheduledDate ? ` · Effective ${new Date(subscription.scheduledDate).toLocaleDateString()}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="button-row">
                        <Link className="button secondary" href="/dashboard/billing" onClick={onClose}>
                          Plans & billing
                        </Link>
                        {!subscription.isCancelled ? (
                          <Button type="button" variant="outline" disabled={canceling} onClick={() => void onCancelSubscription()}>
                            {canceling ? 'Canceling…' : 'Cancel at period end'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {subscription.planKey &&
                    !subscription.isCancelled &&
                    ['active', 'trialing'].includes(subscription.status || '') ? (
                      <PlanSwitcher
                        currentPlanKey={subscription.planKey}
                        currentPriceLabel={subscription.priceLabel}
                        renewalDate={subscription.renewalDate}
                        scheduledPlanKey={subscription.scheduledPlanKey}
                        scheduledPlanName={subscription.scheduledPlanName}
                        scheduledPriceLabel={subscription.scheduledPriceLabel}
                        scheduledDate={subscription.scheduledDate}
                        onScheduled={async () => {
                          await load();
                          await onSettingsChanged?.();
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="settings-plan-card">
                    <div>
                      <h4 className="settings-plan-title">
                        {subscription?.error ? 'Plan status unavailable' : 'No active homepage plan'}
                      </h4>
                      <p className="muted text-sm">
                        {subscription?.error
                          ? 'We could not verify your subscription with the billing provider. Please try again shortly.'
                          : 'Choose a plan to continue using Home Page Chat Plus.'}
                      </p>
                      {subscription?.error ? <p className="text-sm text-amber-700">{subscription.error}</p> : null}
                    </div>
                    <div className="button-row">
                      {!subscription?.error ? (
                        <Link className="button" href="/pricing" onClick={onClose}>
                          View plans
                        </Link>
                      ) : null}
                      <Link className="button secondary" href="/dashboard/billing" onClick={onClose}>
                        Open billing
                      </Link>
                    </div>
                  </div>
                )}
              </section>

              <section className="settings-section">
                <PaymentMethodsPanel />
              </section>

            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
