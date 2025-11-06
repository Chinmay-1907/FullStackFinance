import { type ZodType, type ZodTypeDef } from "zod";

import { ValidationError } from "./errors";

interface ParseOptions {
  message?: string;
  requestId?: string;
}

export const parseWithSchema = <T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  payload: unknown,
  options: ParseOptions = {},
) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, options.requestId);
  }

  return result.data;
};
