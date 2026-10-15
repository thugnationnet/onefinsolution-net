import 'server-only';
import { createStripeBilling } from './stripe-billing';
import { billingEnvironment } from './billing-environment';

export async function createBillingClient() {
  billingEnvironment();
  const billing = createStripeBilling();
  return {
    billing: {
      ...billing,
      // Preserve the real Stripe subscription id (sub_...).
      // Mapping id → product.id broke cancel/reactivate ownership checks and
      // produced false "Subscription not found." errors for active plans.
      getSubscriptions: async () => {
        const result = await billing.getSubscriptions();
        return {
          data: {
            subscriptions:
              result.data.subscriptions?.map((subscription) => ({
                id: subscription.id,
                productId: subscription.product.id,
                status: subscription.status,
                has_active_subscription: subscription.status === 'active',
              })) || [],
          },
          error: result.error,
        };
      },
    },
  };
}
