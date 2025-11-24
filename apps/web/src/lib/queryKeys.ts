export const queryKeys = {
  configModels: ["config", "models"] as const,
  ingestionStatus: (jobId: string) => ["ingestion", "status", jobId] as const,
  ingestionDocuments: (ticker: string, jobId?: string) =>
    ["ingestion", "documents", ticker, jobId ?? ""] as const,
};
