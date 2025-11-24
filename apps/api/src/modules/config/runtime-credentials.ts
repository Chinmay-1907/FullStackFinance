import { promises as fs } from "node:fs";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createModuleLogger } from "../../utils/logger";

const log = createModuleLogger("config:runtime-credentials");

const RUNTIME_DIR = path.resolve(process.cwd(), "storage", "runtime");
const RUNTIME_FILE = path.join(RUNTIME_DIR, "credentials.json");

export type CredentialEnvKey = "GROQ_API_KEY" | "GEMINI_API_KEY" | "TAVILY_API_KEY" | "SEC_EMAIL";

const CREDENTIAL_KEYS: CredentialEnvKey[] = [
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "TAVILY_API_KEY",
  "SEC_EMAIL",
] as const;

let lastLoadedMtime = 0;

const cleanValue = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const readRuntimeFile = (): Partial<Record<CredentialEnvKey, string>> => {
  if (!existsSync(RUNTIME_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(RUNTIME_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Record<CredentialEnvKey, string>>;
    return parsed;
  } catch (error) {
    log.warn({ err: error }, "Failed to read runtime credentials");
    return {};
  }
};

export const applyRuntimeCredentialsToEnv = () => {
  try {
    if (!existsSync(RUNTIME_FILE)) {
      return false;
    }
    const stats = statSync(RUNTIME_FILE);
    if (stats.mtimeMs === lastLoadedMtime) {
      return false;
    }
    lastLoadedMtime = stats.mtimeMs;
    const payload = readRuntimeFile();
    (Object.keys(payload) as CredentialEnvKey[]).forEach((key) => {
      const value = cleanValue(payload[key]);
      if (value) {
        process.env[key] = value;
      }
    });
    log.debug("Runtime credentials applied from disk");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn({ err: error }, "Failed to apply runtime credentials");
    }
    return false;
  }
};

export const saveRuntimeCredentials = async (
  values: Partial<Record<CredentialEnvKey, string | undefined>>,
) => {
  const current = readRuntimeFile();
  CREDENTIAL_KEYS.forEach((key) => {
    if (!(key in values)) {
      return;
    }
    const next = cleanValue(values[key]);
    if (next) {
      current[key] = next;
    } else {
      delete current[key];
    }
  });

  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  await fs.writeFile(RUNTIME_FILE, JSON.stringify(current, null, 2), "utf8");
  lastLoadedMtime = 0;
  log.info({ keys: Object.keys(current) }, "Runtime credentials saved");
};
