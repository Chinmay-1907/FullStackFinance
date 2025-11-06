import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { createModuleLogger } from "./logger";

const log = createModuleLogger("storage");

const DEFAULT_STORAGE_ROOT = process.env["STORAGE_ROOT"] ?? path.resolve(process.cwd(), "storage");

export interface PersistedFile {
  path: string;
  bytes: number;
  hash: string;
}

const ensureDirectory = async (target: string) => {
  await fs.mkdir(target, { recursive: true });
};

export const persistBuffer = async (
  buffer: Buffer,
  relativeDir: string,
  filename?: string,
): Promise<PersistedFile> => {
  const dir = path.join(DEFAULT_STORAGE_ROOT, relativeDir);
  await ensureDirectory(dir);

  const safeName = filename ?? `${randomUUID()}.bin`;
  const fullPath = path.join(dir, safeName);

  await fs.writeFile(fullPath, buffer);

  const hash = createHash("sha256").update(buffer).digest("hex");

  log.debug({ path: fullPath, bytes: buffer.length }, "Persisted raw document");

  return {
    path: fullPath,
    bytes: buffer.length,
    hash,
  };
};
