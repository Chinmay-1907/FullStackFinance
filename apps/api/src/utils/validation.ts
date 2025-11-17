import { ZodError, ZodTypeAny } from "zod";

import { ValidationError } from "./errors";

export const parseWithSchema = <Schema extends ZodTypeAny>(schema: Schema, payload: unknown): Schema["_output"] => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid request payload", {
        issues: error.issues
      });
    }

    throw error;
  }
};
