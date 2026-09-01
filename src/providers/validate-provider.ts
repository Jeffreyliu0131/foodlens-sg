import type { ProviderSetup } from "../shared/schemas";

export class ProviderValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProviderValidationError";
  }
}

function openRouterModelUrl(model: string): string {
  return `https://openrouter.ai/api/v1/model/${model
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export async function validateProviderSetup(
  setup: ProviderSetup,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${setup.apiKey}`,
    Accept: "application/json",
  };

  if (setup.provider === "openrouter") {
    const keyResponse = await fetchImpl("https://openrouter.ai/api/v1/key", {
      headers,
      signal: options.signal,
    });
    if (!keyResponse.ok) {
      throw new ProviderValidationError(
        "OpenRouter rejected this API key.",
        keyResponse.status === 401 ? 401 : 400,
      );
    }
    const modelResponse = await fetchImpl(openRouterModelUrl(setup.model), {
      headers,
      signal: options.signal,
    });
    if (!modelResponse.ok) {
      throw new ProviderValidationError(
        `OpenRouter model '${setup.model}' was not found or is not available to this key.`,
      );
    }
    return;
  }

  const modelResponse = await fetchImpl(
    `https://api.openai.com/v1/models/${encodeURIComponent(setup.model)}`,
    { headers, signal: options.signal },
  );
  if (!modelResponse.ok) {
    throw new ProviderValidationError(
      modelResponse.status === 401
        ? "OpenAI rejected this API key."
        : `OpenAI model '${setup.model}' was not found or is not available to this key.`,
      modelResponse.status === 401 ? 401 : 400,
    );
  }
}
