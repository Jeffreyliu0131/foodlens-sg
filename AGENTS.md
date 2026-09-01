# FoodLens SG project rules

This repository owns the FoodLens SG implementation. The Career Harness outside this directory owns career claims and portfolio routing.

## Canonical sources

- `README.md`: product contract, current status, local run instructions, and public-facing project narrative.
- `docs/ARCHITECTURE.md`: system boundaries, data contracts, and architecture decisions.
- `evals/`: evaluation cases and dated results. Fixtures are test evidence, not current restaurant facts.
- Source code and executable tests: implementation truth.

When documentation and code disagree, report the conflict and update the correct owner. Do not create a second progress file.

## Non-negotiable behavior

- Every current restaurant fact must point to an observed public source or remain unknown.
- A Foodpanda listing, an open listing, current order acceptance, exact-address eligibility, and delivery ETA are separate states.
- Never merge uncertain restaurant identities silently.
- Do not hardcode current restaurant rankings or candidate existence in production behavior.
- Do not scrape private endpoints, bypass CAPTCHAs, or add proxy infrastructure.
- The public research trace exposes operations and provenance, never hidden chain-of-thought.
- Browser-entered API keys may be sent once to the local server but must never be returned, logged, placed in browser storage, written to disk, added to traces, fixtures, or Git.
- The product supports exactly two live single-key choices in V0: OpenRouter and OpenAI. Do not expose advanced search-provider or local-model configuration without a new explicit product decision.

## Build boundaries

- Work only inside this repository unless the current request explicitly authorizes a Harness routing change.
- Do not deploy, publish, commit, push, or create external resources without current authorization.
- Preserve a provider boundary around web search. Dedicated platform adapters are future work, not V0 scope.

## Required verification

Before calling the project complete, run:

```bash
npm run check
npm test
npm run build
npm run eval:fixture
```

Run the live evaluation only when the matching `OPENAI_API_KEY` or `OPENROUTER_API_KEY` is available. Record each unexecuted provider as unverified, never as a pass.
