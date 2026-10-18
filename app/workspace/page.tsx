import { Suspense } from 'react';
import { WorkspaceApplication } from '@/components/workspace-application';
import { BillingStatusBanner } from '@/components/billing-status-banner';
import { currentUser } from '@/lib/session';
import {
  confirmWorkspaceCreditCheckoutSession,
  confirmWorkspaceCardSetupCheckoutSession,
  getWorkspaceBillingData,
  workspaceCreditPurchaseStatus,
} from '@/app/workspace-actions';

export const metadata = {
  title: 'Workspace | One Fin Solution',
  description: 'Your authenticated AI workbench, Workspace credits, and payment settings.',
  robots: { index: false, follow: false },
};

export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{
    purchase?: string;
    purchase_id?: string;
    billing?: string;
    session_id?: string;
  }>;
}) {
  const user = await currentUser();
  const params = await searchParams;
  const purchaseId = params.purchase_id || params.purchase || '';
  const sessionId = params.session_id || '';

  let paymentConfirmed = false;

  // Hosted Checkout return: finalize credits from session (idempotent with webhook).
  if (user && sessionId.startsWith('cs_') && params.billing === 'card_saved') {
    const finalized = await confirmWorkspaceCardSetupCheckoutSession(sessionId);
    paymentConfirmed = 'status' in finalized && finalized.status === 'succeeded';
  } else if (user && sessionId.startsWith('cs_')) {
    const finalized = await confirmWorkspaceCreditCheckoutSession({
      sessionId,
      purchaseId: purchaseId || null,
    });
    paymentConfirmed = 'status' in finalized && finalized.status === 'succeeded';
  } else if (user && purchaseId) {
    const purchaseStatus = await workspaceCreditPurchaseStatus(purchaseId);
    paymentConfirmed = purchaseStatus?.status === 'succeeded';
  }

  if (
    !paymentConfirmed &&
    (params.billing === 'credits_added' || params.billing === 'success') &&
    user &&
    purchaseId
  ) {
    const purchaseStatus = await workspaceCreditPurchaseStatus(purchaseId);
    paymentConfirmed = purchaseStatus?.status === 'succeeded';
  }

  const initialData = user
    ? await getWorkspaceBillingData()
    : { error: 'Sign in to view your Workspace credits and payment details.' };

  return (
    <div className="workspace-route">
      <Suspense fallback={null}>
        <BillingStatusBanner />
      </Suspense>
      <WorkspaceApplication
        email={user?.email ?? null}
        isAuthenticated={Boolean(user)}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}
        initialData={initialData}
        paymentConfirmed={paymentConfirmed}
      />
    </div>
  );
}
