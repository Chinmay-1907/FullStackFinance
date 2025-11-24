const DEFAULT_API_PATH = "/api/v1";

const normalizeBaseUrl = (value?: string) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return DEFAULT_API_PATH;
  }
  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
};

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env["VITE_API_BASE_URL"] as string | undefined,
);

export const FALLBACK_API_BASE_URL = DEFAULT_API_PATH;

export const buildApiUrl = (path: string, baseUrl: string = API_BASE_URL) => {
  if (path.startsWith("http")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalized}`;
};
