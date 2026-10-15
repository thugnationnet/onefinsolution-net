import { Spinner } from "@/components/ui/spinner";

export default function PricingLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-medium mb-4">Upgrade your plan</h1>
      </div>

      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Spinner className="w-6 h-6" />
          <p className="text-muted-foreground">Loading plans...</p>
        </div>
      </div>
    </div>
  );
} 