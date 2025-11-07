import { useMutation, useQuery } from "@tanstack/react-query";
import type { ConfigValidateRequest } from "@fin-rag/shared";
import { apiClient } from "../lib/apiClient";
import { queryKeys } from "../lib/queryKeys";

export const useConfigModels = () =>
  useQuery({
    queryKey: queryKeys.configModels,
    queryFn: () => apiClient.fetchConfigModels(),
  });

export const useValidateConfig = () =>
  useMutation({
    mutationFn: (payload: ConfigValidateRequest) => apiClient.validateConfig(payload),
  });
