import { getConfig } from "./config";
import { runFoodLens } from "./core/pipeline";
import { createDependencies } from "./providers/create-dependencies";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  process.stderr.write(
    "Usage: npm run cli -- --location \"Pasir Panjang, Singapore\" --query \"I want Thai delivery...\" [--json]\n",
  );
  process.exit(2);
}

const location = argument("--location");
const query = argument("--query");
if (!location || !query) usage();

try {
  const runtime = getConfig().environmentProvider;
  if (!runtime) {
    throw new Error(
      "No CLI provider is configured. Set FOODLENS_PROVIDER plus the matching OPENAI_API_KEY or OPENROUTER_API_KEY.",
    );
  }
  const packet = await runFoodLens(
    { location, query },
    createDependencies(runtime),
    {
      onTrace: (event) => {
        process.stderr.write(`[${event.stage}] ${event.summary}\n`);
      },
    },
  );

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${packet.decisionSummary}\n\n`);
    for (const option of packet.recommendations) {
      process.stdout.write(
        `#${option.rank} ${option.restaurantName}${option.branch ? ` (${option.branch})` : ""}\n`,
      );
      process.stdout.write(`${option.verdict} ${option.fitExplanation}\n`);
      if (option.recommendedDishes.length > 0) {
        process.stdout.write(
          `Order: ${option.recommendedDishes.map((dish) => dish.name).join(", ")}\n`,
        );
      }
      process.stdout.write(`Confidence: ${option.confidence}\n\n`);
    }
    process.stdout.write(
      `${packet.metrics.searchActions} searches, ${packet.metrics.sourceCount} sources, ${(packet.metrics.latencyMs / 1000).toFixed(1)}s\n`,
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "FoodLens failed."}\n`,
  );
  process.exitCode = 1;
}
