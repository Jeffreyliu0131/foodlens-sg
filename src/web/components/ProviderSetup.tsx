import {
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  Key,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { LiveProvider } from "../../shared/schemas";
import type { ProviderPublicState } from "../../shared/types";
import { connectProvider, disconnectProvider } from "../api";

const DEFAULT_MODELS: Record<LiveProvider, string> = {
  openrouter: "openrouter/auto",
  openai: "gpt-5.6",
};

const PROVIDER_COPY: Record<
  LiveProvider,
  { name: string; description: string; keyUrl: string; modelUrl: string }
> = {
  openrouter: {
    name: "OpenRouter",
    description: "Choose from many model families. Web search is added automatically.",
    keyUrl: "https://openrouter.ai/settings/keys",
    modelUrl: "https://openrouter.ai/models",
  },
  openai: {
    name: "OpenAI",
    description: "Use OpenAI models directly with native Responses API web search.",
    keyUrl: "https://platform.openai.com/api-keys",
    modelUrl: "https://developers.openai.com/api/docs/models",
  },
};

export function ProviderSetup({
  current,
  onConnected,
  onCancel,
}: {
  current: ProviderPublicState | null;
  onConnected: (state: ProviderPublicState) => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<LiveProvider>("openrouter");
  const [model, setModel] = useState(DEFAULT_MODELS.openrouter);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = PROVIDER_COPY[provider];

  const selectProvider = (next: LiveProvider) => {
    setProvider(next);
    setModel(DEFAULT_MODELS[next]);
    setApiKey("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const state = await connectProvider({ provider, apiKey, model });
      setApiKey("");
      onConnected(state);
    } catch (caught) {
      setApiKey("");
      setError(caught instanceof Error ? caught.message : "Provider connection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const forget = async () => {
    setForgetting(true);
    setError(null);
    try {
      const state = await disconnectProvider();
      onConnected(state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not forget the key.");
    } finally {
      setForgetting(false);
    }
  };

  return (
    <section className="provider-setup" aria-labelledby="provider-title">
      <div className="provider-intro">
        <p className="eyebrow">Connect one provider</p>
        <h1 id="provider-title">One key. Search included.</h1>
        <p className="intro">
          Choose OpenRouter or OpenAI. FoodLens configures the model and web
          search path behind the same evidence pipeline.
        </p>

        <div className="provider-options" role="group" aria-label="Provider choice">
          {(["openrouter", "openai"] as const).map((option) => {
            const optionCopy = PROVIDER_COPY[option];
            const selected = provider === option;
            return (
              <button
                aria-pressed={selected}
                className={`provider-option ${selected ? "selected" : ""}`}
                key={option}
                onClick={() => selectProvider(option)}
                type="button"
              >
                <span className="provider-option-icon">
                  {selected ? <CheckCircle aria-hidden weight="fill" /> : <Sparkle aria-hidden />}
                </span>
                <span>
                  <strong>
                    {optionCopy.name}
                    {option === "openrouter" ? <small>Recommended</small> : null}
                  </strong>
                  <span>{optionCopy.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="provider-boundary">
          <ShieldCheck aria-hidden weight="duotone" />
          <div>
            <strong>Session-only credential</strong>
            <p>
              Your key is validated by {copy.name}, then kept only in FoodLens server
              memory. It is never returned, logged, saved in browser storage, or written
              to this repository.
            </p>
          </div>
        </div>
      </div>

      <form className="provider-form" onSubmit={submit}>
        <div className="provider-form-heading">
          <Key aria-hidden weight="duotone" />
          <div>
            <h2>Connect {copy.name}</h2>
            <p>Usage and web-search charges go to your own provider account.</p>
          </div>
        </div>

        <label>
          <span>Model ID</span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            disabled={submitting}
            onChange={(event) => setModel(event.target.value)}
            required
            spellCheck={false}
            value={model}
          />
          <small>
            Default: <code>{DEFAULT_MODELS[provider]}</code>.{" "}
            <a href={copy.modelUrl} rel="noreferrer" target="_blank">
              Browse models <ArrowSquareOut aria-hidden />
            </a>
          </small>
        </label>

        <label>
          <span>{copy.name} API key</span>
          <input
            autoCapitalize="none"
            autoComplete="new-password"
            disabled={submitting}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={provider === "openrouter" ? "sk-or-v1-..." : "sk-..."}
            required
            spellCheck={false}
            type="password"
            value={apiKey}
          />
          <small>
            <a href={copy.keyUrl} rel="noreferrer" target="_blank">
              Create or copy a key <ArrowSquareOut aria-hidden />
            </a>
            . Remote deployments must use HTTPS.
          </small>
        </label>

        {error ? (
          <div className="form-error" role="alert">
            <WarningCircle aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <button className="button button-primary provider-submit" disabled={submitting}>
          <Key aria-hidden weight="bold" />
          {submitting ? "Validating provider" : `Connect ${copy.name}`}
          <ArrowRight aria-hidden />
        </button>

        <div className="provider-form-actions">
          {onCancel ? (
            <button className="text-button" onClick={onCancel} type="button">
              Keep current connection
            </button>
          ) : null}
          {current?.source === "session" ? (
            <button
              className="text-button danger-text"
              disabled={forgetting}
              onClick={forget}
              type="button"
            >
              {forgetting ? "Forgetting key" : "Forget session key"}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
