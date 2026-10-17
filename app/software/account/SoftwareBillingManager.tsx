'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  listSoftwarePaymentMethods,
  removeSoftwarePaymentMethod,
  setSoftwareDefaultPaymentMethod,
  updateSoftwareBillingProfile,
} from '../checkout/actions';
import type { SoftwareBillingProfile } from '@/lib/software-billing-profile';
import styles from './software-account.module.css';

type Card = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean };

function TextField({
  name,
  label,
  value,
  required = false,
}: {
  name: keyof SoftwareBillingProfile;
  label: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input name={name} defaultValue={value} maxLength={160} required={required} />
    </label>
  );
}

export function SoftwareBillingManager({
  profile,
}: {
  profile: SoftwareBillingProfile;
  publishableKey?: string;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProfile, startProfileTransition] = useTransition();

  const refreshCards = useCallback(async () => {
    const result = await listSoftwarePaymentMethods();
    if ('error' in result) {
      setError(result.error || 'Unable to load Software payment methods.');
      setCards([]);
    } else {
      setError('');
      setCards(result.methods);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshCards();
  }, [refreshCards]);

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    startProfileTransition(async () => {
      const result = await updateSoftwareBillingProfile(data);
      if (result.error) setError(result.error);
      else setMessage(result.message || 'Software billing details saved.');
    });
  }


  async function updateCard(id: string, action: 'default' | 'remove') {
    setError('');
    setMessage('');
    const result = action === 'default'
      ? await setSoftwareDefaultPaymentMethod(id)
      : await removeSoftwarePaymentMethod(id);
    if (result.error) setError(result.error);
    else setMessage(result.message || 'Software payment method updated.');
    await refreshCards();
  }

  return (
    <div className={styles.manager}>
      {(error || message) && <p className={error ? styles.error : styles.message} role={error ? 'alert' : 'status'}>{error || message}</p>}
      <form className={styles.profileForm} onSubmit={saveProfile}>
        <h2>Software billing and addresses</h2>
        <p>These names and addresses are stored separately from subscription and Workspace billing.</p>
        <div className={styles.fields}>
          <TextField name="fullName" label="Software profile name" value={profile.fullName} />
          <TextField name="phone" label="Phone" value={profile.phone} />
          <TextField name="companyName" label="Company" value={profile.companyName} />
          <TextField name="billingName" label="Billing name" value={profile.billingName} />
          <TextField name="billingLine1" label="Billing address" value={profile.billingLine1} />
          <TextField name="billingLine2" label="Address line 2" value={profile.billingLine2} />
          <TextField name="billingCity" label="City" value={profile.billingCity} />
          <TextField name="billingState" label="State / province" value={profile.billingState} />
          <TextField name="billingPostal" label="Postal code" value={profile.billingPostal} />
          <TextField name="billingCountry" label="Country code (e.g. US)" value={profile.billingCountry} />
        </div>
        <label className={styles.checkbox}>
          <input type="checkbox" name="shippingSameAsBilling" defaultChecked={profile.shippingSameAsBilling} />
          Shipping address is the same as billing
        </label>
        <div className={styles.fields}>
          <TextField name="shippingName" label="Shipping recipient" value={profile.shippingName} />
          <TextField name="shippingLine1" label="Shipping address" value={profile.shippingLine1} />
          <TextField name="shippingLine2" label="Shipping address line 2" value={profile.shippingLine2} />
          <TextField name="shippingCity" label="Shipping city" value={profile.shippingCity} />
          <TextField name="shippingState" label="Shipping state / province" value={profile.shippingState} />
          <TextField name="shippingPostal" label="Shipping postal code" value={profile.shippingPostal} />
          <TextField name="shippingCountry" label="Shipping country code" value={profile.shippingCountry} />
        </div>
        <button type="submit" disabled={savingProfile}>{savingProfile ? 'Savingâ€¦' : 'Save Software billing details'}</button>
      </form>

      <section className={styles.cards}>
        <div className={styles.cardsHeading}>
          <div><h2>Software payment methods</h2><p>Cards appear after a successful purchase or balance payment. No separate card-setup step.</p></div>
        </div>
        {loading ? <p>Loading Software cardsâ€¦</p> : cards.length === 0 ? <p>No Software cards yet. Complete a purchase to save a card.</p> : (
          <ul>
            {cards.map((card) => (
              <li key={card.id}>
                <span><strong>{card.brand} Â·Â·Â·Â· {card.last4}</strong><small>Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}{card.isDefault ? ' Â· Default' : ''}</small></span>
                <span className={styles.cardActions}>
                  {!card.isDefault && <button type="button" onClick={() => void updateCard(card.id, 'default')}>Make default</button>}
                  <button type="button" onClick={() => void updateCard(card.id, 'remove')}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
