import type { ProviderRuntimeConfig } from "../config";
import { thaiPasirPanjangFixture } from "../fixtures/thai-pasir-panjang";
import type { FoodLensDependencies } from "../shared/types";
import { FixtureProvider } from "./fixture-provider";
import { OpenAIResearchProvider } from "./openai-provider";
import { OpenRouterResearchProvider } from "./openrouter-provider";

export function createDependencies(config: ProviderRuntimeConfig): FoodLensDependencies {
  if (config.provider === "fixture") {
    const provider = new FixtureProvider(thaiPasirPanjangFixture);
    return {
      intentModel: provider,
      searchProvider: provider,
      provider: { kind: "fixture", model: config.model },
    };
  }
  if (config.provider === "openrouter") {
    const provider = new OpenRouterResearchProvider(config);
    return {
      intentModel: provider,
      searchProvider: provider,
      provider: { kind: "openrouter", model: config.model },
    };
  }
  const provider = new OpenAIResearchProvider(config);
  return {
    intentModel: provider,
    searchProvider: provider,
    provider: { kind: "openai", model: config.model },
  };
}
