'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { plans, findPlan, priceLabel } from '@/lib/plans';
import { changePlanAction } from '@/app/billing-actions';

type PlanChangeAction = 'upgrade' | 'downgrade' | 'remove';

export function PlanSwitcher({
  currentPlanKey,
  currentPriceLabel,
  renewalDate,
  scheduledPlanKey,
  scheduledPlanName,
  scheduledPriceLabel,
  scheduledDate,
  onScheduled,
}: {
  currentPlanKey?: string | null;
  currentPriceLabel?: string | null;
  renewalDate?: string | null;
  scheduledPlanKey?: string | null;
  scheduledPlanName?: string | null;
  scheduledPriceLabel?: string | null;
  scheduledDate?: string | null;
  onScheduled?: () => void | Promise<void>;
}) {
  const defaultPlanKey = scheduledPlanKey || currentPlanKey || 'monthly';
  const [key, setKey] = useState(defaultPlanKey);
  const [confirm, setConfirm] = useState<PlanChangeAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const selectablePlans = plans.filter((plan) => plan.key !== 'custom');
  const currentRank = selectablePlans.findIndex((plan) => plan.key === currentPlanKey);
  const selectedRank = selectablePlans.findIndex((plan) => plan.key === key);
  const selectedPlan = findPlan(key);
  const isCurrentPlan = key === currentPlanKey;
  const effectiveDate = renewalDate
    ? new Date(renewalDate).toLocaleDateString()
    : 'your next renewal';

  async function saveChange() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await changePlanAction(confirm === 'remove' ? currentPlanKey || key : key);
      if (!result.success) {
        setError(result.error || 'Unable to schedule this plan change.');
        return;
      }
      setMessage(confirm === 'remove'
        ? 'Scheduled plan change removed. Your current plan will continue.'
        : `${selectedPlan.name} is scheduled for ${new Date(result.date!).toLocaleDateString()}. Your current plan remains active until then.`);
      setConfirm(null);
      router.refresh();
      await onScheduled?.();
    } catch (cause) {
      console.error('Unable to schedule subscription plan change:', cause);
      setError('Unable to schedule this plan change. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plan-switcher">
      <h3>Change your plan</h3>
      {currentPlanKey ? (
        <p className="plan-switcher-current">
          Current: <strong>{findPlan(currentPlanKey).name}</strong>
          {currentPriceLabel ? ` · ${currentPriceLabel}` : ''}
          {renewalDate ? ` · Renews ${effectiveDate}` : ''}
        </p>
      ) : null}
      {scheduledPlanKey && scheduledPlanName ? (
        <p className="plan-switcher-scheduled" role="status">
          Scheduled: <strong>{scheduledPlanName}</strong>
          {scheduledPriceLabel ? ` · ${scheduledPriceLabel}` : ''}
          {scheduledDate ? ` · Effective ${new Date(scheduledDate).toLocaleDateString()}` : ` · Effective ${effectiveDate}`}
        </p>
      ) : null}
      <label className="field">
        Select a plan
        <select
          aria-label="Select a plan"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setConfirm(null);
            setError('');
            setMessage('');
          }}
        >
          {selectablePlans.map((plan) => (
            <option value={plan.key} key={plan.key}>{plan.name} - {priceLabel(plan)}</option>
          ))}
        </select>
      </label>
      <p className="plan-switcher-note">
        Plan changes take effect on {effectiveDate}. Your current plan or trial remains active until then.
        No proration or additional free trial is applied.
      </p>
      {message ? <p role="status" className="notice success">{message}</p> : null}
      {error ? <p role="alert" className="notice error">{error}</p> : null}
      {confirm ? (
        <div className="notice plan-switcher-confirm">
          <p>
            {confirm === 'remove'
              ? `Remove the scheduled switch and keep ${findPlan(currentPlanKey!).name}?`
              : `Schedule ${selectedPlan.name} at ${priceLabel(selectedPlan)} starting ${effectiveDate}?`}
          </p>
          <div className="button-row">
            <button type="button" className="button" disabled={busy} onClick={() => void saveChange()}>
              {busy ? 'Saving…' : confirm === 'remove' ? 'Confirm removal' : `Confirm ${confirm}`}
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="button-row plan-switcher-actions">
          <button
            type="button"
            className="button"
            disabled={busy || currentRank < 0 || selectedRank <= currentRank}
            onClick={() => setConfirm('upgrade')}
          >
            Upgrade Plan
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || currentRank < 0 || selectedRank < 0 || selectedRank >= currentRank}
            onClick={() => setConfirm('downgrade')}
          >
            Downgrade Plan
          </button>
          {scheduledPlanKey ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy || !currentPlanKey}
              onClick={() => {
                setKey(currentPlanKey || key);
                setConfirm('remove');
              }}
            >
              Remove scheduled change
            </button>
          ) : null}
          {isCurrentPlan && !scheduledPlanKey ? (
            <p className="plan-switcher-hint">Choose a different plan to schedule an upgrade or downgrade.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
