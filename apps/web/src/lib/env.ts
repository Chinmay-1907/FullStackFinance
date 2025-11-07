const normalizeBaseUrl = (value?: string) => {
  if (!value) {
    return "/api/v1";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env["VITE_API_BASE_URL"] as string | undefined,
);

export const buildApiUrl = (path: string) => {
  if (path.startsWith("http")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
};
