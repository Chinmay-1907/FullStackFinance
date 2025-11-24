import { useMutation, useQuery } from "@tanstack/react-query";
import type { IngestionStartRequest } from "@fin-rag/shared";
import { apiClient } from "../lib/apiClient";
import { queryKeys } from "../lib/queryKeys";

interface StatusOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export const useStartIngestion = () =>
  useMutation({
    mutationFn: (payload: IngestionStartRequest) => apiClient.startIngestion(payload),
  });

export const useIngestionStatus = (jobId?: string, options: StatusOptions = {}) =>
  useQuery({
    queryKey: queryKeys.ingestionStatus(jobId ?? ""),
    enabled: Boolean(jobId) && (options.enabled ?? true),
    refetchInterval: options.refetchInterval ?? 5000,
    queryFn: ({ signal }) => apiClient.fetchIngestionStatus(jobId!, signal),
  });

export const useIngestionDocuments = (
  params: { ticker?: string; jobId?: string },
  enabled = true,
) =>
  useQuery({
    queryKey: queryKeys.ingestionDocuments(params.ticker ?? "", params.jobId),
    enabled: Boolean(params.ticker) && enabled,
    queryFn: () =>
      apiClient.fetchIngestionDocuments({
        ticker: params.ticker!,
        jobId: params.jobId,
      }),
    staleTime: 60_000,
  });

export const useRetryIngestion = () =>
  useMutation({
    mutationFn: (jobId: string) => apiClient.retryIngestion(jobId),
  });

export const useApproveIngestion = () =>
  useMutation({
    mutationFn: (jobId: string) => apiClient.approveIngestion(jobId),
  });
