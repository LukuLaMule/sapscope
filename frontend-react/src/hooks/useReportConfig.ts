import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchReportConfig, updateReportConfig, type ApiReportConfig } from "@/lib/api";

export function useReportConfig(clientId: string | undefined) {
  return useQuery<ApiReportConfig>({
    queryKey: ["report-config", clientId],
    queryFn:  () => fetchReportConfig(clientId!),
    enabled:  !!clientId,
    staleTime: 30_000,
  });
}

export function useUpdateReportConfig(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ApiReportConfig>) => updateReportConfig(clientId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-config", clientId] });
    },
  });
}
