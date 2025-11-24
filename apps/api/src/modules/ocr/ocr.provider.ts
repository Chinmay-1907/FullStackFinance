import { createModuleLogger } from "../../utils/logger";

import { TesseractOcrProvider, type TesseractOcrProviderOptions } from "./providers/tesseract.provider";

export interface OcrRecognizeOptions {
  mimeType?: string;
  language?: string;
}

export interface OcrResult {
  text: string;
  confidence?: number;
}

export interface OcrProvider {
  recognize(buffer: Buffer, options?: OcrRecognizeOptions): Promise<OcrResult>;
  dispose?(): Promise<void>;
}

export interface OcrProviderFactoryOptions extends TesseractOcrProviderOptions {}

const log = createModuleLogger("ocr:provider");

export const createOcrProvider = (options: OcrProviderFactoryOptions = {}): OcrProvider => {
  log.info({ provider: "tesseract", language: options.language ?? "eng" }, "Initializing OCR provider");
  return new TesseractOcrProvider(options);
};
