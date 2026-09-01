import { loadEnvFile } from "node:process";
import type { LiveProvider, ProviderSetup } from "./shared/schemas";

try {
  loadEnvFile();
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ENOENT") throw error;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type ProviderRuntimeConfig = {
  provider: LiveProvider | "fixture";
  apiKey: string | undefined;
  model: string;
  broadSearchCalls: number;
  deepSearchCalls: number;
};

export type FoodLensConfig = {
  environmentProvider: ProviderRuntimeConfig | null;
  broadSearchCalls: number;
  deepSearchCalls: number;
  sessionTtlMs: number;
  maxSessions: number;
  host: string;
  port: number;
};

function environmentProvider(
  provider: string,
  broadSearchCalls: number,
  deepSearchCalls: number,
): ProviderRuntimeConfig | null {
  if (provider === "fixture") {
    return {
      provider: "fixture",
      apiKey: undefined,
      model: "dated-fixture",
      broadSearchCalls,
      deepSearchCalls,
    };
  }
  if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto",
      broadSearchCalls,
      deepSearchCalls,
    };
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6",
      broadSearchCalls,
      deepSearchCalls,
    };
  }
  return null;
}

export function getConfig(): FoodLensConfig {
  const broadSearchCalls = positiveInt(process.env.FOODLENS_BROAD_SEARCH_CALLS, 8);
  const deepSearchCalls = positiveInt(process.env.FOODLENS_DEEP_SEARCH_CALLS, 6);
  const provider = process.env.FOODLENS_PROVIDER?.trim() || "openai";
  return {
    environmentProvider: environmentProvider(
      provider,
      broadSearchCalls,
      deepSearchCalls,
    ),
    broadSearchCalls,
    deepSearchCalls,
    sessionTtlMs:
      positiveInt(process.env.FOODLENS_SESSION_TTL_MINUTES, 720) * 60 * 1000,
    maxSessions: positiveInt(process.env.FOODLENS_MAX_SESSIONS, 100),
    host: process.env.HOST?.trim() || "127.0.0.1",
    port: positiveInt(process.env.PORT, 8787),
  };
}

export function runtimeConfig(
  setup: ProviderSetup,
  config: Pick<FoodLensConfig, "broadSearchCalls" | "deepSearchCalls">,
): ProviderRuntimeConfig {
  return {
    provider: setup.provider,
    apiKey: setup.apiKey,
    model: setup.model,
    broadSearchCalls: config.broadSearchCalls,
    deepSearchCalls: config.deepSearchCalls,
  };
}
