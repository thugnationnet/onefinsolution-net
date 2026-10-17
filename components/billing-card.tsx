'use client';

/** Card management no longer uses SetupIntents. Cards are saved after a real payment. */
export function BillingCard() {
  return (
    <div className="stack">
      <p className="muted">
        Payment methods are saved automatically after a successful subscription payment. There is no separate card setup.
      </p>
      <p className="muted small">
        Manage saved cards under Plans &amp; billing, or pay a new subscription invoice with a different card.
      </p>
    </div>
  );
}
