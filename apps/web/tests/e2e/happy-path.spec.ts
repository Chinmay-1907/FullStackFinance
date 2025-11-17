import { test, expect } from "@playwright/test";

const iso = new Date().toISOString();

const sseStream = [
  'event: retrieval',
  'data: {"ticker":"AAPL","chunkCount":1,"citations":[{"docId":"doc-1","snippet":"Earnings call context"}]}',
  "",
  'event: token',
  'data: {"token":"Hello "}',
  "",
  'event: token',
  'data: {"token":"world"}',
  "",
  'event: done',
  'data: {"answer":"Hello world [1]","citations":[{"docId":"doc-1","snippet":"Earnings call context"}],"latencyMs":12}',
  "",
  "",
].join("\n");

test("setup → ingestion → query happy path", async ({ page }) => {
  await page.route("**/api/v1/config/models", (route) =>
    route.fulfill({
      json: {
        providers: [
          {
            provider: "groq",
            label: "Groq",
            models: [
              { id: "llama3-8b", name: "LLAMA3 8B", type: "llm" },
              { id: "text-embedding-3-small", name: "Embeddings", type: "embedding" },
            ],
          },
        ],
        defaults: {
          provider: "groq",
          model: "llama3-8b",
          embeddingModel: "text-embedding-3-small",
        },
      },
    }),
  );

  await page.route("**/api/v1/config/validate", (route) =>
    route.fulfill({ json: { ok: true, missing: [] } }),
  );

  await page.route("**/api/v1/ingestion/start", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-123" } }),
  );

  await page.route("**/api/v1/ingestion/status/job-123", (route) =>
    route.fulfill({
      json: {
        jobId: "job-123",
        ticker: "AAPL",
        status: "completed",
        progress: 1,
        currentStage: "embedding",
        stages: [
          { name: "download", status: "completed", progress: 1 },
          { name: "chunk", status: "completed", progress: 1 },
          { name: "embedding", status: "completed", progress: 1 },
        ],
        startedAt: iso,
        updatedAt: iso,
        completedAt: iso,
      },
    }),
  );

  await page.route("**/api/v1/rag/query", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: sseStream,
    }),
  );

  await page.goto("/setup");
  await page.getByLabel("Groq API Key").fill("sk-groq");
  await page.getByLabel("Gemini API Key").fill("sk-gemini");
  await page.getByLabel("Tavily API Key").fill("tv-key");
  await page.getByLabel("SEC.gov Email").fill("user@example.com");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/Configuration looks good/i)).toBeVisible();

  await page.getByRole("link", { name: "Collect" }).click();
  await page.getByRole("button", { name: "Start ingestion" }).click();
  await expect(page.getByText("job-123")).toBeVisible();
  await expect(page.getByText(/COMPLETED/)).toBeVisible();
  await expect(page.getByText(/download/i)).toBeVisible();

  await page.getByRole("link", { name: "Query" }).click();
  await page.getByRole("button", { name: "Run query" }).click();

  await expect(page.getByText("Hello world [1]")).toBeVisible();
  await expect(page.getByText("[1] doc-1")).toBeVisible();
});
