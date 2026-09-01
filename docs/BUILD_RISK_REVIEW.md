# Build Risk Review: FoodLens SG

**Mode:** Pre-build

**Date:** 2026-09-01

## Verdict

**Build small.** A narrow, complete prototype is justified by a real decision workflow and a testable technical thesis. Current evidence does not justify a broad consumer product or market claim.

## Biggest risk

- **R1 trust:** Search-only retrieval may not consistently surface correct, current Google, Foodpanda, menu, price, or delivery evidence. Unsupported hard facts would break the product's central promise.
- **R2 demand:** One real workflow proves that the problem exists for one person, not that a broader audience will repeatedly use it.
- **R3 retention:** Restaurant choice is recurring, but deep cross-platform research may not be worth its latency and cost on every order.

## Demand level

Not applicable. This is a new idea, primarily built as a product and engineering proof.

## Evidence ledger

| Signal | Strength | What it proves |
|---|---|---|
| The project originated in a real multi-step Thai delivery decision | Medium | The workflow and fragmentation are real; prevalence is unknown |
| A search-enabled GPT produced a useful first answer | Weak to medium | Search-first feasibility is plausible; factual accuracy was not yet audited |
| Current OpenAI documentation exposes live web search, source lists, search actions, location context, and URL citations | Medium | The core API capability exists; domain coverage is not guaranteed |
| No repeated external usage, switching, payment, or retention evidence exists | Counter-signal | Market demand is unvalidated |

## Validation plan

1. Run the Pasir Panjang Thai scenario as a concierge research audit. Pass only if at least four reasonable candidates are found and every rating, review count, menu item, price, and platform claim has a source or is marked unknown.
2. Repeat with two unseen location and cuisine combinations. If retrieval or identity resolution degrades materially, position the prototype as an evidence-audit workbench instead of an autonomous decision agent.

## Initial probe result

The original scenario passed the first retrieval probe on 2026-09-01. Public search surfaced more than four plausible candidates, direct Foodpanda listings, menu items including Pad See Ew and basil pork, prices, branch addresses, and multiple Google-rating aggregations. It also exposed the intended failure cases:

- Google reputation may be available through third-party aggregators rather than a Google Maps source.
- Foodpanda pages can expose a listing and menu without confirming exact-address delivery eligibility.
- A page-level `CLOSED` signal may be time-specific and cannot be interpreted as permanent closure.
- Chain restaurants must be resolved at branch level.

## Routing

The supplied project brief already covers the work normally routed through `define-problem-statement` and a lightweight PRD. Implementation therefore proceeds under the narrower claim documented above.

## Sources

- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Feature-change review: dual single-key onboarding

**Date:** 2026-09-01

**Verdict:** Build small.

The product owner narrowed provider setup to two simple paths: OpenRouter with automatic Web Search, or OpenAI with native Web Search. The feature is an onboarding workflow blocker for the intended nontechnical user because the previous live mode required manual environment editing.

The primary risk is trust: users provide paid API credentials. The accepted implementation therefore keeps browser-entered keys only in an expiring server-memory session, returns only an opaque HttpOnly cookie, clears the input after validation, and prevents keys from entering browser storage, logs, traces, fixtures, disk, or Git. Remote hosting requires HTTPS.

OpenRouter search uses citation annotations followed by a separate structured extraction call. This preserves the existing grounding contract rather than trusting model-written URLs. OpenRouter's server tool is Beta, and live behavior remains unverified until a real-key eval is run.

- [OpenRouter Web Search](https://openrouter.ai/docs/guides/features/server-tools/web-search)
- [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenRouter current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
