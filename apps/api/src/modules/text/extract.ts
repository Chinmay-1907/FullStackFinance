import { promises as fs } from "node:fs";
import path from "node:path";

import type { IngestionSource } from "@fin-rag/shared";
import { htmlToText, type HtmlToTextOptions } from "html-to-text";

type PdfParseResult = {
  text?: string;
};

type PdfParseFn = (dataBuffer: Buffer, options?: unknown) => Promise<PdfParseResult>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: PdfParseFn = require("pdf-parse");

import { createModuleLogger } from "../../utils/logger";
import type { OcrProvider } from "../ocr/ocr.provider";

const log = createModuleLogger("text:extract");

const TEXT_EXTENSIONS = new Set([".txt", ".text", ".md", ".markdown", ".log"]);
const HTML_EXTENSIONS = new Set([".html", ".htm", ".xhtml", ".xml"]);
const JSON_EXTENSIONS = new Set([".json"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"]);

export type ExtractionStrategy = "text" | "html" | "json" | "pdf" | "ocr" | "binary";

export interface ExtractTextOptions {
  filePath: string;
  mimeType?: string;
  ticker?: string;
  sourceType?: IngestionSource;
  ocrProvider?: OcrProvider;
}

export interface ExtractedTextResult {
  text: string;
  strategy: ExtractionStrategy;
}

const htmlOptions: HtmlToTextOptions = {
  wordwrap: false,
  selectors: [
    { selector: "img", format: "skip" as const },
    { selector: "script", format: "skip" as const },
    { selector: "style", format: "skip" as const },
  ],
};

const isPlainText = (extension: string, mimeType?: string) =>
  TEXT_EXTENSIONS.has(extension) || (mimeType ? mimeType.startsWith("text/") : false);

const isHtml = (extension: string, mimeType?: string) =>
  HTML_EXTENSIONS.has(extension) || mimeType?.includes("html") === true;

const isJson = (extension: string, mimeType?: string) =>
  JSON_EXTENSIONS.has(extension) || mimeType === "application/json";

const isPdf = (extension: string, mimeType?: string) =>
  PDF_EXTENSIONS.has(extension) || mimeType === "application/pdf";

const isOcrCandidate = (extension: string, mimeType?: string) =>
  IMAGE_EXTENSIONS.has(extension) || mimeType?.startsWith("image/") === true;

export const extractTextFromFile = async ({
  filePath,
  mimeType,
  ticker,
  sourceType,
  ocrProvider,
}: ExtractTextOptions): Promise<ExtractedTextResult> => {
  const extension = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);
  const context = { filePath, extension, mimeType, ticker, sourceType };

  if (isPlainText(extension, mimeType)) {
    return {
      text: buffer.toString("utf8"),
      strategy: "text",
    };
  }

  if (isHtml(extension, mimeType)) {
    const html = buffer.toString("utf8");
    return {
      text: htmlToText(html, htmlOptions),
      strategy: "html",
    };
  }

  if (isJson(extension, mimeType)) {
    const raw = buffer.toString("utf8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      return {
        text: JSON.stringify(parsed, null, 2),
        strategy: "json",
      };
    } catch (error) {
      log.warn({ ...context, err: error }, "Failed to parse JSON payload; returning raw");
      return { text: raw, strategy: "json" };
    }
  }

  if (isPdf(extension, mimeType)) {
    try {
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim();
      if (text && text.length > 0) {
        return { text, strategy: "pdf" };
      }
      log.warn({ ...context }, "PDF parse returned empty text; attempting OCR fallback");
      if (ocrProvider) {
        const result = await ocrProvider.recognize(buffer, { mimeType: mimeType ?? "application/pdf" });
        if (result.text.trim().length > 0) {
          return { text: result.text.trim(), strategy: "ocr" };
        }
      }
    } catch (error) {
      log.error({ ...context, err: error }, "Failed to parse PDF document");
    }
  }

  if (isOcrCandidate(extension, mimeType)) {
    if (!ocrProvider) {
      throw new Error(`OCR provider is not configured for ${filePath}`);
    }
    const result = await ocrProvider.recognize(buffer, { mimeType });
    if (!result.text.trim()) {
      throw new Error(`OCR provider returned empty payload for ${filePath}`);
    }
    return { text: result.text.trim(), strategy: "ocr" };
  }

  log.info({ ...context }, "Falling back to UTF-8 decode for unrecognized file type");
  return {
    text: buffer.toString("utf8"),
    strategy: "binary",
  };
};
