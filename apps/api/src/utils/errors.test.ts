import type { Request, Response, NextFunction } from "express";

import { errorHandler, ValidationError, toErrorEnvelope } from "./errors";

describe("errors", () => {
  it("converts validation errors to error envelopes", () => {
    const error = new ValidationError("Invalid", { field: "ticker" });
    const envelope = toErrorEnvelope(error);

    expect(envelope.code).toBe("validation_error");
    expect(envelope.message).toBe("Invalid");
    expect(envelope.details).toEqual({ field: "ticker" });
  });

  it("sends structured response via error handler", () => {
    const err = new ValidationError("Oops", { field: "ticker" });
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json } as unknown as Response;

    errorHandler(err, {} as Request, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "validation_error",
        message: "Oops"
      })
    );
  });
});
