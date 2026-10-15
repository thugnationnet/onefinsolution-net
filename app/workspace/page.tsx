import { Suspense } from 'react';
import { WorkspaceApplication } from '@/components/workspace-application';
import { BillingStatusBanner } from '@/components/billing-status-banner';
import { currentUser } from '@/lib/session';
import { getWorkspaceBillingData, workspaceCreditPurchaseStatus } from '@/app/workspace-actions';

export const metadata = {
  title: 'Workspace | One Fin Solution',
  description: 'Your authenticated AI workbench, Workspace credits, and payment settings.',
  robots: { index: false, follow: false },
};

export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; billing?: string }>;
}) {
  const user = await currentUser();
  const params = await searchParams;
  const purchaseStatus = user && params.purchase ? await workspaceCreditPurchaseStatus(params.purchase) : null;
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
        paymentConfirmed={purchaseStatus?.status === 'succeeded'}
      />
    </div>
  );
}
