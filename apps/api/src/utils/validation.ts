import { type ZodSchema, ZodError } from "zod";

import { ValidationError } from "./errors";

interface ParseOptions {
  message?: string;
  requestId?: string;
}

export const parseWithSchema = <T>(
  schema: ZodSchema<T>,
  payload: unknown,
  options: ParseOptions = {},
) => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw ValidationError.fromZod(error, options.requestId);
    }
    throw error;
  }
};
