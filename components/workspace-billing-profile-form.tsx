'use client';

import { useState, type FormEvent } from 'react';
import { updateWorkspaceBillingProfileAction } from '@/app/account-actions';
import type { WorkspaceBillingProfile } from '@/lib/workspace-billing-profile';

function TextField({
  name,
  label,
  value,
  maxLength = 200,
}: {
  name: string;
  label: string;
  value: string;
  maxLength?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} defaultValue={value} maxLength={maxLength} />
    </label>
  );
}

export function WorkspaceBillingProfileForm({ profile }: { profile: WorkspaceBillingProfile }) {
  const [sameAsBilling, setSameAsBilling] = useState(profile.shippingSameAsBilling);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await updateWorkspaceBillingProfileAction(new FormData(event.currentTarget));
      if (result.error) setError(result.error);
      else setMessage(result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save Workspace billing details.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="form-grid">
        <TextField name="fullName" label="Full name" value={profile.fullName} />
        <TextField name="phone" label="Phone" value={profile.phone} />
        <TextField name="companyName" label="Company (optional)" value={profile.companyName} />
      </div>

      <div>
        <h4>Workspace billing address</h4>
        <div className="form-grid mt-4">
          <TextField name="billingName" label="Billing name" value={profile.billingName} />
          <TextField name="billingLine1" label="Address line 1" value={profile.billingLine1} />
          <TextField name="billingLine2" label="Address line 2" value={profile.billingLine2} />
          <TextField name="billingCity" label="City" value={profile.billingCity} />
          <TextField name="billingState" label="State / province" value={profile.billingState} />
          <TextField name="billingPostal" label="Postal code" value={profile.billingPostal} />
          <TextField name="billingCountry" label="Country code" value={profile.billingCountry} maxLength={2} />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="shippingSameAsBilling"
          checked={sameAsBilling}
          onChange={(event) => setSameAsBilling(event.currentTarget.checked)}
        />
        Workspace shipping address is the same as its billing address
      </label>

      {!sameAsBilling ? (
        <div>
          <h4>Workspace shipping address</h4>
          <div className="form-grid mt-4">
            <TextField name="shippingName" label="Recipient name" value={profile.shippingName} />
            <TextField name="shippingLine1" label="Address line 1" value={profile.shippingLine1} />
            <TextField name="shippingLine2" label="Address line 2" value={profile.shippingLine2} />
            <TextField name="shippingCity" label="City" value={profile.shippingCity} />
            <TextField name="shippingState" label="State / province" value={profile.shippingState} />
            <TextField name="shippingPostal" label="Postal code" value={profile.shippingPostal} />
            <TextField name="shippingCountry" label="Country code" value={profile.shippingCountry} maxLength={2} />
          </div>
        </div>
      ) : null}

      <p className="muted text-sm">These details are stored for Workspace billing only, separately from homepage subscription details.</p>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {message ? <p className="notice" role="status">{message}</p> : null}
      <div>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save Workspace billing details'}
        </button>
      </div>
    </form>
  );
}
