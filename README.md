# FullStackFinance — Financial RAG System

## Table of Contents

- [Executive Summary](#executive-summary)
- [Architecture Overview](#architecture-overview)
  - [Workspace Layout](#workspace-layout)
  - [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [API Contract](#api-contract)
  - [Configuration](#configuration)
  - [Ingestion](#ingestion)
  - [Vector Store](#vector-store)
  - [Query](#query)
  - [Error Envelope](#error-envelope)
- [Data Model](#data-model)
- [Non-Functional Requirements](#non-functional-requirements)
- [Build, Test, and Deploy Expectations](#build-test-and-deploy-expectations)
- [Assumptions & TODOs](#assumptions--todos)

## Executive Summary

FullStackFinance is a full-stack MERN + TypeScript Retrieval-Augmented Generation (RAG) platform tailored for financial research. The system ingests finance content (SEC filings, earnings call transcripts, relevant news), processes and indexes it into a vector store, and delivers source-grounded answers to user queries via LLMs (Groq/Gemini). Observability, testing, and deployment tooling are treated as first-class citizens from the outset.

Key objectives include:

- Streamlined credential setup and validation for third-party providers (Groq, Gemini, Tavily, SEC email).
- Resilient ingestion pipeline that fetches, cleans, chunks, embeds, and indexes documents.
- Responsive React dashboard for setup, ingestion tracking, and querying with citations.
- Typed REST APIs backed by Zod schemas, shared DTOs, and comprehensive logging/tracing.

## Architecture Overview

### Workspace Layout

```
root/
├── apps/
│   ├── api/            # Fastify/Express backend with ingestion + RAG services
│   └── web/            # React frontend (Vite + Tailwind)
├── packages/
│   └── shared/         # Zod schemas, DTOs, enums, shared utilities
├── docker/             # Docker Compose & service Dockerfiles
├── docs/               # Architecture references, ADRs, API docs
├── scripts/            # Setup, migration, maintenance scripts
├── pnpm-workspace.yaml # Workspace definition
├── tsconfig.base.json  # Shared TS config & path aliases
└── package.json        # Root scripts & toolchain configuration
```

### Data Flow

1. **Setup:** User enters provider credentials in the web UI. The API validates and stores configuration (env-backed, never persisted in plaintext).
2. **Ingestion:** User starts ingestion for one or more tickers. BullMQ workers orchestrate fetching SEC filings, transcripts, and news, applying OCR where needed.
3. **Processing:** Text is cleaned, normalized, chunked, embedded, and written to a vector store (FAISS or Pinecone). Vector manifests are persisted in MongoDB.
4. **Querying:** The API retrieves top-K chunks, crafts a structured prompt, and calls the selected LLM. Responses are streamed back with citations.
5. **Monitoring:** Job progress, metadata, logs, and traces are exposed for observability.

## Technology Stack

| Layer         | Technology / Tooling                                | Notes                                           |
| ------------- | --------------------------------------------------- | ----------------------------------------------- |
| Frontend      | React (Vite), TypeScript, Tailwind CSS, React Query | Typed DTO consumption, streaming answers        |
| Backend       | Node.js, Fastify or Express, TypeScript             | Zod validation, modular services                |
| Persistence   | MongoDB (Mongoose), optional MinIO/S3               | Metadata & raw document storage                 |
| Queues        | Redis + BullMQ                                      | Ingestion + embedding workers                   |
| Vector Store  | FAISS (local) and Pinecone adapter                  | Vector manifests persisted in Mongo             |
| LLM Providers | Groq, Google Gemini                                 | Embeddings + completions                        |
| Retrieval     | LangChain.js                                        | Chunking, embedding pipelines                   |
| Observability | Pino logging, OpenTelemetry traces                  | Redacted secrets, structured logs               |
| Testing       | Jest, Supertest, React Testing Library, Playwright  | Unit, integration, and e2e coverage             |
| Tooling       | pnpm, Turborepo (optional), ESLint, Prettier, Husky | Strict TS, lint-staged                          |
| Deployment    | Docker Compose, GitHub Actions CI                   | Builds, tests, linting, container orchestration |

## API Contract

All endpoints accept/produce JSON, validated with Zod schemas shared via `@shared`. Authentication is not yet included.

### Configuration

- `GET /api/v1/config/models` – Lists supported providers/models and defaults.
- `POST /api/v1/config/validate` – Body: `{ groqKey?, geminiKey?, tavilyKey?, secEmail? }`
  - Response: `{ ok: boolean; missing: string[] }`
  - Validates presence/format of credentials (no external verification yet).

### Ingestion

- `POST /api/v1/ingestion/start` – `{ ticker: string; sources?: ("sec"|"transcripts"|"news")[]; from?: string; to?: string }`
  - Response: `{ jobId: string }`
  - Enqueues ingestion job with resumable stages.
- `GET /api/v1/ingestion/status/:jobId` – Returns job state, percentage complete, active stage, errors.
- `POST /api/v1/ingestion/retry/:jobId` – Requeues failed steps for the job.

### Vector Store

- `VECTOR_STORE` env toggles FAISS (default) vs Pinecone (skeleton/TODO). FAISS persists JSON indexes to `/data/vector/<ticker>` (override via `VECTOR_DATA_DIR`) alongside a local manifest.
- `VectorManifest` documents in Mongo capture embedding model, chunking params, and docIds per ticker. The `VectorStoreService` keeps manifests idempotent, handling rebuild vs append semantics.
- Pinecone adapter stubs exist with TODOs for `PINECONE_API_KEY`, `PINECONE_INDEX`, and namespace strategy once production credentials are available.
- Chunking defaults (size 1200 / overlap 150) and embedding batch sizes derive from the shared `RAGDefaults`; retry/batch knobs are centralized in `feature-flags.ts`.

### Query

- `POST /api/v1/rag/query` (SSE) → `{ ticker: string; question: string; k?: number; model?: string }`
  - Events:
    - `retrieval` → `{ ticker, chunkCount, citations }`
    - `token` → `{ token: string }`
    - `done` → final `QueryResponse` (`{ answer, citations, latencyMs }`)
    - `error` → shared error envelope
  - Clients set `Accept: text/event-stream`, stream tokens, and terminate when the `done` event arrives. Answers include bracketed references that align with the returned citations array.

### Frontend Application (apps/web)

- Vite + React + TypeScript app (`pnpm --filter @fin-rag/web dev`) that consumes the shared DTOs and mirrors backend contracts.
- React Router routes: `/setup`, `/collect`, `/query`, `/insights`. Each route corresponds to the Phase 5/6 backend flows (credential validation, ingestion orchestration, streaming RAG, metrics placeholders).
- React Query powers API calls with `@tanstack/react-query-devtools` enabled in dev. Query keys map directly to backend endpoints.
- TailwindCSS provides styling primitives; component kit kept minimal (cards, badges, buttons) to stay close to design tokens.
- The app expects `VITE_API_BASE_URL` (default `/api/v1`) for backend connectivity and streams `/rag/query` via the browser `ReadableStream` API while updating tokens/citations live.

### Metrics

- `GET /metrics` → Prometheus-compatible text with default Node metrics plus:
  - `rag_chunks_processed_total{ticker,source}`
  - `rag_embedding_batches_total{provider}`
  - `rag_query_latency_ms_bucket{ticker,model,...}` histogram for percentile tracking

### Error Envelope

- All error responses conform to `{ code: string; message: string; details?: unknown }`.
- Common codes include `VALIDATION_ERROR`, `NOT_FOUND`, `INGESTION_FAILED`, `INTERNAL_ERROR`.

## Data Model

MongoDB collections (indicative schemas):

- **Tickers** — `{ symbol: string; name?: string; createdAt: Date }`
- **Documents** — `{ ticker: string; sourceType: "sec"|"transcript"|"news"; url?: string; formType?: string; publishedAt?: Date; textPath: string; textHash: string; bytes?: number; createdAt: Date }`
  - Index `{ ticker, sourceType, publishedAt }`
- **IngestionJobs** — `{ stages: { name: string; status: "queued"|"running"|"failed"|"completed"; progress: number; error?: string }[]; createdAt: Date; updatedAt: Date }`
- **VectorManifests** — `{ ticker: string; embeddingModel: string; chunkSize: number; overlap: number; vectorStore: "faiss"|"pinecone"; docIds: string[]; createdAt: Date }`

Raw document text and assets are stored either on disk (`/data/raw/<ticker>/<docId>.txt`) or in MinIO/S3 buckets (configurable).

## Non-Functional Requirements

- **Reliability:** Resumable ingestion, idempotent vector writes, exponential backoff with jitter for network requests.
- **Performance:** Streaming responses, caching embeddings, batching API calls.
- **Security:** Secrets loaded via environment variables, redacted logs, CORS restricted to first-party web app.
- **Observability:** Pino logs with structured metadata, OpenTelemetry traces for ingestion and query stages, health checks at `/healthz`.

## Build, Test, and Deploy Expectations

- Development environment uses pnpm workspaces. Root scripts orchestrate commands across packages (`pnpm -r dev`, `pnpm -r test`, etc.).
- `pnpm install` (or `pnpm i`) bootstraps dependencies across the monorepo.
- `pnpm -w build` builds all packages and apps. `pnpm -w test` runs unit and integration suites.
- Docker Compose (`docker/compose.yml`) provisions MongoDB, Redis, API, web, and optional MinIO.
- GitHub Actions workflow executes lint → test → build on pull requests.
- Observability stack (logs/traces) is configured during API bootstrap.

## Assumptions & TODOs

- **TODO:** Choose between Fastify and Express for the API (defaulting to Fastify unless constraints arise).
- **TODO:** Finalize OCR strategy (tesseract.js vs. external microservice). Document integration steps.
- **TODO:** Implement Pinecone adapter details (API key loading, namespace strategy).
- **TODO:** Wire Groq/Gemini completion streaming once production API keys are provided (currently using a local mock provider for dev/test).
- **TODO:** Define production deployment target (e.g., Render, Railway, AWS ECS) and IaC scripts.
- **TODO:** Align Phase 6 frontend streaming client with the documented SSE contract (`retrieval`, `token`, `done`, `error` events).
- **Assumption:** Secrets are managed via `.env` in development and an external secret manager in production.
- **Assumption:** Initial implementation focuses on FAISS for local vector store with optional Pinecone integration.

This README serves as a foundational reference for all subsequent phases. Each phase will extend the repository with the components outlined above while adhering to the contracts and requirements documented here.
