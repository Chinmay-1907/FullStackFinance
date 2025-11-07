import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { ConfigValidateRequest } from "@fin-rag/shared";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useConfigModels, useValidateConfig } from "../hooks/useConfig";

const STORAGE_KEY = "finrag.credentials";

const defaultForm: ConfigValidateRequest = {
  groqKey: "",
  geminiKey: "",
  tavilyKey: "",
  secEmail: "",
};

const credentialLabels: Record<keyof ConfigValidateRequest, string> = {
  groqKey: "Groq API Key",
  geminiKey: "Gemini API Key",
  tavilyKey: "Tavily API Key",
  secEmail: "SEC.gov Email",
};

export const SetupPage = () => {
  const [form, setForm] = useState<ConfigValidateRequest>(defaultForm);
  const { data: models } = useConfigModels();
  const validateMutation = useValidateConfig();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setForm(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    validateMutation.mutate(form);
  };

  const missingSet = new Set(validateMutation.data?.missing ?? []);

  return (
    <div className="space-y-6">
      <Card
        title="Provider Credentials"
        description="Store sensitive keys in .env or a secret manager in production. These inputs are used only to call the validation endpoint."
        headerAction={
          <Button type="submit" form="setup-form" className="px-4 py-2">
            Validate
          </Button>
        }
      >
        <form id="setup-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          {Object.entries(credentialLabels).map(([key, label]) => (
            <label key={key} className="space-y-2 text-sm font-medium text-slate-700">
              {label}
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                type={key === "secEmail" ? "email" : "password"}
                value={form[key as keyof ConfigValidateRequest] ?? ""}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [key]: event.target.value,
                  }))
                }
                placeholder={key === "secEmail" ? "user@example.com" : "sk-..."}
              />
              {missingSet.has(key.toUpperCase()) ? (
                <p className="text-xs text-rose-500">Missing value</p>
              ) : null}
            </label>
          ))}
        </form>
        {validateMutation.isSuccess && (
          <p className="mt-4 text-sm text-emerald-600">
            Configuration looks good! Missing keys: {validateMutation.data.missing.length}
          </p>
        )}
      </Card>

      <Card
        title="Available Models"
        description="Sourced from the API /config/models endpoint so the UI stays in sync with backend capabilities."
      >
        {!models ? (
          <p className="text-sm text-slate-500">Loading model catalog...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {models.providers.map((provider) => (
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
