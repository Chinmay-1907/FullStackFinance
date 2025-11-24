import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { ConfigValidateRequest } from "@fin-rag/shared";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useConfigModels, useValidateConfig } from "../hooks/useConfig";
import { ApiError } from "../lib/apiClient";
import { API_BASE_URL } from "../lib/env";

const STORAGE_KEY = "finrag.credentials";

type CredentialField = keyof ConfigValidateRequest;
type CredentialFormState = Record<CredentialField, string>;
type CredentialEnvKey = "GROQ_API_KEY" | "GEMINI_API_KEY" | "TAVILY_API_KEY" | "SEC_EMAIL";

interface CredentialDescriptor {
  key: CredentialField;
  label: string;
  envKey: CredentialEnvKey;
  type: "password" | "email";
  placeholder: string;
}

const credentialFields: CredentialDescriptor[] = [
  {
    key: "groqKey",
    label: "Groq API Key",
    envKey: "GROQ_API_KEY",
    type: "password",
    placeholder: "sk-...",
  },
  {
    key: "geminiKey",
    label: "Gemini API Key",
    envKey: "GEMINI_API_KEY",
    type: "password",
    placeholder: "sk-...",
  },
  {
    key: "tavilyKey",
    label: "Tavily API Key",
    envKey: "TAVILY_API_KEY",
    type: "password",
    placeholder: "tvly-...",
  },
  {
    key: "secEmail",
    label: "SEC.gov Email",
    envKey: "SEC_EMAIL",
    type: "email",
    placeholder: "user@example.com",
  },
];

const defaultForm: CredentialFormState = credentialFields.reduce(
  (acc, field) => ({ ...acc, [field.key]: "" }),
  {} as CredentialFormState,
);

const sanitizeFormForRequest = (values: CredentialFormState): ConfigValidateRequest =>
  credentialFields.reduce((payload, field) => {
    const trimmed = values[field.key].trim();
    if (trimmed.length > 0) {
      payload[field.key] = trimmed;
    }
    return payload;
  }, {} as ConfigValidateRequest);

const greetingProviderLabels: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini",
  local: "Local Assistant",
  test: "Test Mode",
};

const getErrorMessage = (error: unknown) => {
  if (!error) return "Unknown error";
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const SetupPage = () => {
  const [form, setForm] = useState<CredentialFormState>(defaultForm);
  const [visibleFields, setVisibleFields] = useState<Record<CredentialField, boolean>>(
    () =>
      credentialFields.reduce(
        (acc, field) => ({ ...acc, [field.key]: false }),
        {} as Record<CredentialField, boolean>,
      ),
  );
  const modelsQuery = useConfigModels();
  const validateMutation = useValidateConfig();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      setForm((previous) => {
        const next = { ...previous };
        for (const { key } of credentialFields) {
          const value = parsed[key];
          if (typeof value === "string") {
            next[key] = value;
          }
        }
        return next;
      });
    } catch {
      // ignore malformed data
    }
  }, []);

  const toggleFieldVisibility = (field: CredentialField) => {
    setVisibleFields((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    validateMutation.mutate(sanitizeFormForRequest(form));
  };

  const missingSet = new Set(validateMutation.data?.missing ?? []);

  return (
    <div className="space-y-6">
      <Card
        title="Provider Credentials"
        description="Store sensitive keys in .env or a secret manager in production. These inputs are used only to call the validation endpoint."
        headerAction={
          <Button
            type="submit"
            form="setup-form"
            className="px-4 py-2"
            disabled={validateMutation.isPending}
          >
            {validateMutation.isPending ? "Validating..." : "Validate"}
          </Button>
        }
      >
        <form id="setup-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          {credentialFields.map((field) => {
            const isSensitive = field.type === "password";
            const inputType = isSensitive
              ? visibleFields[field.key]
                ? "text"
                : "password"
              : "email";

            return (
              <label key={field.key} className="space-y-2 text-sm font-medium text-slate-700">
                <div className="flex items-center justify-between">
                  <span>{field.label}</span>
                  {isSensitive ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand transition hover:text-brand-dark focus:outline-none"
                      onClick={() => toggleFieldVisibility(field.key)}
                      aria-pressed={visibleFields[field.key]}
                    >
                      {visibleFields[field.key] ? "Hide" : "Show"}
                    </button>
                  ) : null}
                </div>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  type={inputType}
                  value={form[field.key]}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  autoComplete={field.type === "email" ? "email" : "off"}
                />
                {missingSet.has(field.envKey) ? (
                  <p className="text-xs text-rose-500">Missing value</p>
                ) : null}
              </label>
            );
          })}
        </form>
        {validateMutation.isSuccess && (
          <div className="mt-4 space-y-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-700">
              Configuration looks good! Missing keys: {validateMutation.data.missing.length}
            </p>
            {validateMutation.data.greeting ? (
              <div className="text-sm text-emerald-900">
                <p className="font-semibold">
                  LLM confirmation
                  {validateMutation.data.greetingProvider
                    ? ` (${greetingProviderLabels[validateMutation.data.greetingProvider] ?? validateMutation.data.greetingProvider})`
                    : ""}
                  :
                </p>
                <p className="mt-1">{validateMutation.data.greeting}</p>
              </div>
            ) : null}
          </div>
        )}
        {validateMutation.isError ? (
          <p className="mt-4 text-sm text-rose-600">
            Unable to validate credentials: {getErrorMessage(validateMutation.error)}.
          </p>
        ) : null}
      </Card>

      <Card
        title="Available Models"
        description="Sourced from the API /config/models endpoint so the UI stays in sync with backend capabilities."
      >
        {modelsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading model catalog...</p>
        ) : modelsQuery.isError ? (
          <p className="text-sm text-rose-500">
            Unable to load models from {API_BASE_URL}. {getErrorMessage(modelsQuery.error)}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {modelsQuery.data?.providers.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{provider.label}</p>
                  <StatusBadge tone="info">{provider.models.length} models</StatusBadge>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {provider.models.map((model) => (
                    <li key={model.id}>
                      <span className="font-medium text-slate-700">{model.type.toUpperCase()}</span>{" "}
                      &mdash; {model.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
