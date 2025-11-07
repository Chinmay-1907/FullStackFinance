import { QueryRequestSchema, type QueryRequest } from "@fin-rag/shared";
import { NextFunction, Request, Response } from "express";

import { createErrorEnvelope } from "../../utils/errors";
import { parseWithSchema } from "../../utils/validation";
import { RagService, type QueryStreamEvent } from "./rag.service";

export class RagController {
  constructor(private readonly service = new RagService()) {}

  stream = async (req: Request, res: Response, next: NextFunction) => {
    const requestId =
      (req as typeof req & { id?: string }).id ?? (res.getHeader("x-request-id") as string | undefined);
    let payload: QueryRequest;

    try {
      payload = parseWithSchema(QueryRequestSchema, req.body ?? {}, { requestId });
    } catch (error) {
      next(error);
      return;
    }

    this.setupSse(res);

    const abortController = new AbortController();
    req.once("close", () => {
      abortController.abort();
    });

    try {
      for await (const event of this.service.streamQuery(payload, {
        requestId,
        signal: abortController.signal,
      })) {
        this.writeEvent(res, event);
      }
    } catch (error) {
      const envelope = createErrorEnvelope(error, requestId);
      this.writeEvent(res, { type: "error", data: envelope });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  };

  private setupSse(res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
  }

  private writeEvent(res: Response, event: QueryStreamEvent | { type: "error"; data: unknown }) {
    if (res.writableEnded) {
      return;
    }

    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }
}
