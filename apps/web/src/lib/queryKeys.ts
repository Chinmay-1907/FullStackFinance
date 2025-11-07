export const queryKeys = {
  configModels: ["config", "models"] as const,
  ingestionStatus: (jobId: string) => ["ingestion", "status", jobId] as const,
};
