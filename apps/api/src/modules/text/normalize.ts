import { createHash } from "node:crypto";

import type { IngestionSource } from "@fin-rag/shared";

import { createModuleLogger } from "../../utils/logger";
import { persistBuffer } from "../../utils/storage";

const log = createModuleLogger("text:normalize");

const boilerplatePatterns: RegExp[] = [
  /^\s*forward-looking statements.*$/i,
  /^\s*this report contains.*forward-looking.*$/i,
  /^\s*table of contents\s*$/i,
];

const normalizeWhitespace = (input: string) =>
  input
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/[ \u00A0]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripBoilerplate = (input: string) =>
  input
    .split("\n")
    .filter((line) => !boilerplatePatterns.some((pattern) => pattern.test(line)))
    .join("\n");

const dedupeSections = (input: string) => {
  const sections = input.split(/\n{2,}/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) {
      continue;
    }
    const hash = createHash("sha256").update(trimmed).digest("hex");
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    result.push(trimmed);
  }

  return result.join("\n\n");
};

export interface NormalizeOptions {
  rawText: string;
  ticker: string;
  sourceType: IngestionSource;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface NormalizedText {
  text: string;
  textHash: string;
  bytes: number;
  ticker: string;
  sourceType: IngestionSource;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export const normalizeText = (options: NormalizeOptions): NormalizedText => {
  const ticker = options.ticker.trim().toUpperCase();
  const cleaned = dedupeSections(normalizeWhitespace(stripBoilerplate(options.rawText ?? "")));

  const textHash = createHash("sha256").update(cleaned).digest("hex");

  return {
    text: cleaned,
    textHash,
    bytes: Buffer.byteLength(cleaned, "utf8"),
    ticker,
    sourceType: options.sourceType,
    publishedAt: options.publishedAt,
    metadata: options.metadata,
  };
};

export interface PersistNormalizedOptions extends NormalizeOptions {
  storageSubdir: string;
  filename?: string;
}

export interface PersistedNormalizedText extends NormalizedText {
  textPath: string;
}

export const normalizeAndPersistText = async (
  options: PersistNormalizedOptions,
): Promise<PersistedNormalizedText> => {
  const normalized = normalizeText(options);
  const filename =
    options.filename ?? `${normalized.ticker.toLowerCase()}-${Date.now().toString(36)}.txt`;

  const persisted = await persistBuffer(
    Buffer.from(normalized.text, "utf8"),
    options.storageSubdir,
    filename,
  );

  log.debug(
    {
      ticker: normalized.ticker,
      sourceType: normalized.sourceType,
      textPath: persisted.path,
      bytes: persisted.bytes,
    },
    "Persisted normalized text asset",
  );

  return {
    ...normalized,
    textPath: persisted.path,
    bytes: persisted.bytes,
  };
};
