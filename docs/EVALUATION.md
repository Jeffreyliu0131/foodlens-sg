# Evaluation

FoodLens SG evaluates two different systems:

1. deterministic decision mechanics;
2. live public-web retrieval quality.

They must not be collapsed into one score. A fixture can prove code behavior but cannot prove current restaurant accuracy. A live search can surface current evidence but is not automatically reproducible.

## Evaluation questions

- Did broad search retrieve a useful candidate set?
- Did branch-level identity resolution merge obvious variants and preserve uncertainty?
- Does every accepted record point to an observed source URL?
- Are ratings, review counts, menu items, prices, platform presence, and delivery states represented without unsupported inference?
- Does review volume affect reputation reliability?
- Does changing user priority change the ranking?
- Did finalist research add or contradict material evidence?
- Does every final fact and dish cite a valid evidence ID?
- Is there a decisive top option when evidence permits?
- How many searches, sources, model calls, tokens, and seconds did the request consume?

## Deterministic suite

```bash
npm run check
npm test
npm run eval:fixture
```

The suite covers:

- canonical URL source membership;
- punctuation and parenthetical branch variants;
- conflicting chain postal codes;
- generic chain listings with missing branch evidence;
- review-volume influence;
- preference-sensitive winner changes;
- minimum-order values not being mistaken for dish prices;
- extraction of search actions, sources, and URL citations from Responses API output;
- opaque provider-session cookies, expiry, deletion, and bounded eviction;
- OpenRouter and OpenAI key/model validation contracts without inference calls;
- OpenRouter Web Search annotations converted into the common source-record schema;
- OpenRouter structured-output fallback for models that reject strict JSON Schema;
- removal of generated dishes that lack a cited menu claim;
- the complete Thai scenario through both research passes.

## Fixture boundary

`src/fixtures/thai-pasir-panjang.ts` is a dated, partial simulation derived from the 2026-09-01 retrieval probe and simplified where needed to exercise deterministic behavior.

It is allowed to contain historical restaurant names because it is evaluation data. The production search plan never receives those names.

Fixture success means:

- at least four candidates survive resolution;
- at least four observed sources exist;
- no recommendation cites a missing evidence ID;
- a top option exists;
- a desired dish is grounded;
- the operational trace covers broad search, grounding, resolution, finalist research, final ranking, and recommendation.

Fixture success does not mean the restaurants, ratings, menus, prices, or ranking are current.

## Live scenario

Run:

```bash
npm run eval:live
```

Input:

```text
Location: Pasir Panjang, Singapore

Thai delivery around SGD 30 or below. Strong reputation across Google and
Foodpanda matters, including review volume. Desired dishes include Pad See Ew
or basil pork, with savory and strongly flavored food preferred.
```

Set `FOODLENS_PROVIDER` to `openai` or `openrouter` with its matching environment key before running. The live run reports historical candidate recall separately, but does not fail because an old restaurant disappears or a new candidate wins. Browser session keys are intentionally inaccessible to the CLI.

## Failure categories

| Category | Example | Required behavior |
|---|---|---|
| Retrieval miss | Important local restaurant never appears | Report recall limitation; improve broad plan before tuning ranking |
| Ungrounded extraction | Record cites a URL absent from search output | Reject the record and add a warning |
| Identity collision | Two branches share a chain name | Keep separate or uncertain unless location evidence resolves them |
| Source conflict | Rating observations differ materially | Preserve both and reduce confidence |
| Delivery overclaim | Listing interpreted as exact-address eligibility | Downgrade to `listing_found` and expose uncertainty |
| Price overclaim | Minimum order interpreted as a dish price | Exclude it from budget fit |
| Dish hallucination | Generated dish is absent from cited menu evidence | Discard it and use grounded fallback copy |
| No-decision state | All candidates fail grounding | Return no recommendation with trace and warnings |

## Stability protocol

For meaningful stability measurement, run the same live case multiple times on the same day and record:

- candidate-set overlap;
- top-three overlap;
- top-choice frequency;
- claim support rate;
- source-domain overlap;
- latency and usage range.

V0 provides the decision packet needed for this analysis but does not claim a stability benchmark before repeated live runs exist.

## Latest verified local result

On 2026-09-01:

- TypeScript check passed.
- All deterministic tests passed.
- The fixture end-to-end eval passed.
- Production web and Node builds passed.
- Local config state, provider-required protection, same-origin rejection, fixture streaming, evidence expansion, source links, desktop layout, 390px mobile layout, and light/dark themes were smoke-tested.
- The OpenRouter/OpenAI chooser, provider-specific model defaults, password input clearing, invalid-key errors, and session-only security copy were visually and interactively tested. A provider authentication error that echoed a partial key was found during QA and replaced with fully generic text.
- `npm audit --omit=dev` reported zero production vulnerabilities. The full development tree reported one low-severity `esbuild 0.27.7` advisory affecting a high-condition Windows local development-server path. Current Vite still constrains the affected minor, so no force override was applied.
- Live OpenAI and OpenRouter E2E runs were not executed because no real provider keys were present in the environment. OpenRouter protocol behavior was verified with mocked official response shapes.
