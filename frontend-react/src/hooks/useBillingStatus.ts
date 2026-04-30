import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface BillingStatus {
  subscribed: boolean;
  tier?: string;
  status?: string;
  trial_ends_at?: string;
  days_remaining?: number;
}

export function useBillingStatus(): BillingStatus | null {
  const { data } = useQuery<BillingStatus>({
    queryKey: ["billing-status"],
    queryFn: () => apiFetch<BillingStatus>("/api/v1/billing/status"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return data ?? null;
}
