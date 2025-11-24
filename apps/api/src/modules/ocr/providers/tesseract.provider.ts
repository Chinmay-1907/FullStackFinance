import { createWorker, type Worker } from "tesseract.js";

import { createModuleLogger } from "../../../utils/logger";
import type { OcrProvider, OcrRecognizeOptions, OcrResult } from "../ocr.provider";

export interface TesseractOcrProviderOptions {
  language?: string;
  workerConfig?: Parameters<typeof createWorker>[2];
}

const DEFAULT_LANGUAGE = "eng";

export class TesseractOcrProvider implements OcrProvider {
  private workerPromise: Promise<Worker> | null = null;
  private readonly logger = createModuleLogger("ocr:tesseract");
  private readonly language: string;
  private readonly workerConfig?: Parameters<typeof createWorker>[2];

  constructor(options: TesseractOcrProviderOptions = {}) {
    this.language = options.language ?? process.env["OCR_LANGUAGE"] ?? DEFAULT_LANGUAGE;
    this.workerConfig = options.workerConfig;
  }

  private async ensureWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const worker = await createWorker(this.language, undefined, {
          logger: (message) => {
            if (message.status === "recognizing text") {
              this.logger.debug(
                { progress: Number((message.progress * 100).toFixed(2)) },
                "Tesseract OCR progress",
              );
            }
          },
          ...(this.workerConfig ?? {}),
        });

        await worker.load();
        await worker.reinitialize(this.language);
        return worker;
      })();
    }

    return this.workerPromise;
  }

  async recognize(buffer: Buffer, options?: OcrRecognizeOptions): Promise<OcrResult> {
    const worker = await this.ensureWorker();
    const language = options?.language ?? this.language;

    if (language !== this.language) {
      await worker.reinitialize(language);
    }

    const { data } = await worker.recognize(buffer);

    return {
      text: data?.text?.trim() ?? "",
      confidence: data?.confidence,
    };
  }

  async dispose() {
    if (!this.workerPromise) {
      return;
    }

    const worker = await this.workerPromise;
    await worker.terminate();
    this.workerPromise = null;
  }
}
