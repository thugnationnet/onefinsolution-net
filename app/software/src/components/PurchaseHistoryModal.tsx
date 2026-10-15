import { useEffect, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';

interface Purchase {
  id: string;
  product_name: string;
  amount_satang: number;
  currency: string;
  status: string;
  created_at: string;
}

const currencyFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

export function PurchaseHistoryModal({ onClose }: { onClose: () => void }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('auth-modal-open');
    const controller = new AbortController();
    fetch('/api/orders', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { orders?: Purchase[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Purchase history could not be loaded.');
        setPurchases(data.orders || []);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Purchase history could not be loaded.');
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('auth-modal-open');
    };
  }, [onClose]);

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-dialog purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
        <button className="auth-close" type="button" aria-label="Close purchase history" onClick={onClose}><X size={19} /></button>
        <p className="auth-eyebrow">ONE FIN SOFTWARE</p>
        <h2 id="purchase-title">Purchase history</h2>
        <p className="auth-description">Your recent template checkout records.</p>
        {loading && <p className="purchase-state"><LoaderCircle className="auth-spinner" size={17} /> Loading purchases…</p>}
        {error && <p className="auth-message is-error" role="alert">{error}</p>}
        {!loading && !error && purchases.length === 0 && <p className="purchase-state">You have no template purchases yet.</p>}
        {!loading && purchases.length > 0 && (
          <ul className="purchase-list">
            {purchases.map((purchase) => (
              <li key={purchase.id}>
                <div><strong>{purchase.product_name}</strong><small>{new Date(purchase.created_at).toLocaleDateString()}</small></div>
                <div className="purchase-amount">
                  <strong>{currencyFormatter.format(purchase.amount_satang / 100)}</strong>
                  <span className={`purchase-status status-${purchase.status}`}>{purchase.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="purchase-footnote">Sandbox checkouts do not charge real money. Digital downloads are not connected yet.</p>
      </section>
    </div>
  );
}
