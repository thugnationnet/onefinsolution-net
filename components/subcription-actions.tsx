"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cancelSubscriptionAction, reactivateSubscriptionAction } from "@/app/actions";
import { toast } from "sonner";
import { Subscription } from "@/types/billing";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubscriptionActions({
  subscription,
}: {
  subscription: Subscription;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleCancelSubscription(id: string) {
    setIsLoading(true);
    const result=await cancelSubscriptionAction(id);
    if(!result.success) toast.error(result.error||'Unable to cancel.');
    setIsLoading(false);
    router.refresh();
  }

  async function handleReactivateSubscription(id: string) {
    setIsLoading(true);
    const result=await reactivateSubscriptionAction(id);
    if(!result.success) toast.error(result.error||'Unable to reactivate.');
    setIsLoading(false);
    router.refresh();
  }

  return (
    <>
      {!subscription.cancel_at_period_end && (
        <Button
          onClick={() => handleCancelSubscription(subscription.id)}
          disabled={isLoading}
          variant="destructive"
          className="w-full"
        >
          <Spinner variant="primary" isLoading={isLoading} />
          {isLoading ? "Cancelling..." : "Cancel Subscription"}
        </Button>
      )}
      {subscription.cancel_at_period_end && (
        <Button
          onClick={() => handleReactivateSubscription(subscription.id)}
          disabled={isLoading}
          className="w-full"
        >
          <Spinner variant="primary" isLoading={isLoading} />
          {isLoading ? "Reactivating..." : "Reactivate Subscription"}
        </Button>
      )}
    </>
  );
}
