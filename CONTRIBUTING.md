# Contributing

FoodLens SG values small, testable changes that make retrieval, grounding, identity resolution, ranking, or decision communication more reliable.

## Setup

```bash
npm install
npm run dev
```

Use the browser setup for normal local work. Copy `.env.example` only for CLI, CI, or fixture development. Use `FOODLENS_PROVIDER=fixture` for deterministic UI work and a live provider only when the change actually depends on public-web behavior.

## Before opening a change

```bash
npm run check
npm test
npm run eval:fixture
npm run build
```

If a valid OpenRouter or OpenAI key is available and the change touches retrieval or prompts, also run `npm run eval:live` for that provider and report the dated result without treating old restaurant names as fixed truth.

## Evidence discipline

- Do not add current restaurant facts to production code.
- Do not make fixture data an implicit runtime fallback.
- Do not merge uncertain branches silently.
- Do not interpret a delivery listing as exact-address eligibility.
- Do not accept an extracted source URL unless the provider observed it.
- Do not recommend a dish without a cited menu claim.
- Preserve disagreements and unknown values.
- Never return or log a browser-entered API key. Session cookies contain only opaque IDs.

## Provider changes

The only live V0 providers are OpenRouter and OpenAI. Both must return branch-level source records plus an observed-source list and must not bypass the grounding guard. A third provider requires a new explicit scope decision.

## Tests

Every behavior change needs a bad case, not only a happy path. Prefer small deterministic fixtures that isolate the mechanism under test.

Do not make a test pass by fixing a restaurant's rank. Test the causal property instead, such as review-volume sensitivity, branch separation, source rejection, or preference-responsive ranking.
