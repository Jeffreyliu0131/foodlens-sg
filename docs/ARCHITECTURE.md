# FoodLens SG V0 architecture

## Decision summary

FoodLens SG is a request-scoped research pipeline, not a restaurant database and not a single giant model prompt.

The system starts from an incentive-alignment constraint: a delivery platform's ranked feed is an input source, not the user's decision objective and not an independent truth source. FoodLens therefore discovers beyond one feed, preserves source-level evidence, and ranks only after applying the user's current intent. This is a product hypothesis about opaque ranking incentives, not a claim that any platform has been proven to manipulate recommendations.

```text
Request
  -> Intent extraction
  -> Deterministic search plan
  -> Broad web research
  -> Claim and source validation
  -> Branch-aware entity resolution
  -> Deterministic preliminary ranking
  -> Deep research on finalists
  -> Re-validation and re-ranking
  -> Grounded recommendation
  -> Decision packet plus operational trace
```

V0 exposes two single-key provider paths: OpenRouter with `openrouter:web_search`, and OpenAI Responses API with `web_search`. Both adapt into the same FoodLens evidence contract. Dedicated Google Places or delivery-platform adapters remain outside V0.

## Architecture constraints

1. **Search is retrieval, not truth.** A model may discover and extract evidence. Deterministic code validates schemas, source membership, identity matches, confidence bands, and ranking.
2. **Claims are source-addressable.** Ratings, review counts, prices, menu items, delivery signals, addresses, and platform presence live in evidence records with a URL and retrieval timestamp.
3. **Unknown is a valid value.** Missing evidence is never filled from model memory.
4. **Branch identity matters.** Records are merged automatically only when name and location signals are strong enough. Ambiguous pairs are returned as uncertain matches.
5. **Confidence is categorical.** `high`, `medium`, and `low` summarize evidence coverage and consistency. They are not probabilities.
6. **Ranking is user-relative.** The model extracts preference weights; deterministic code applies them to reputation, menu fit, delivery fit, budget fit, location fit, and evidence confidence.
7. **No hidden reasoning trace.** The UI exposes interpreted criteria, planned and actual searches, sources, records, merge decisions, shortlist changes, warnings, timing, usage, and tool-call counts.

## Runtime shape

- **Web client:** React and Vite. A two-option provider setup, one decision form, a conclusion-first result surface, evidence inspection, and an expandable operational trace.
- **HTTP server:** Node.js with configuration and NDJSON streaming endpoints. User-entered API keys are sent once to the server, never returned, and never persisted by the browser.
- **CLI:** Calls the same pipeline used by the HTTP server.
- **Validation:** Zod schemas at every boundary.
- **Tests:** Vitest for normalization, entity resolution, grounding, confidence, ranking, and fixture end-to-end behavior.
- **Persistence:** None in V0. Each request returns a self-contained decision packet.

## Provider harness

```text
Provider setup
  -> OpenRouter key + model
  -> or OpenAI key + model
       |
       v
Capability adapter
  -> IntentModel
  -> SearchProvider
       |
       v
FoodLens core
  -> Grounding -> Resolution -> Ranking -> Recommendation
```

The product intentionally offers only two provider choices. It does not expose a separate search API, local-model mode, arbitrary base URL, or advanced provider composition.

OpenAI uses one Responses API call for each semantic stage and its native search tool for research. OpenRouter uses its server-side Web Search tool for retrieval, then a separate structured extraction call so citation URLs can be converted into the same source-record schema without trusting model-written URLs.

## API key lifecycle

Browser-entered keys follow a server-memory-only contract:

1. the browser sends a key once to `POST /api/config`;
2. the server validates the key and chosen model against the selected provider;
3. the server stores the key in an expiring in-memory session and sets only an opaque, HttpOnly, SameSite cookie;
4. the browser receives provider name, model, source, and expiry, never the key;
5. disconnect, expiry, or server restart destroys the in-memory credential;
6. keys never enter local storage, logs, trace events, fixtures, repository files, or decision packets.

This is a local-first V0, not a durable hosted secret vault. Remote hosting requires HTTPS. Horizontal scaling or persistent cross-device credentials would require an encrypted secret store and are explicitly not implemented.

## Model and deterministic boundaries

| Stage | Mechanism | Reason |
|---|---|---|
| Intent extraction | Model with Structured Outputs | Natural-language constraints and preference strength are semantic |
| Search plan | Deterministic templates from intent | Cheap, inspectable, and sufficient for a narrow domain |
| Broad retrieval | Provider-native search adapter | Candidate discovery and heterogeneous public pages require semantic navigation |
| Claim validation | Deterministic | A cited URL must have been observed by the provider |
| Entity resolution | Deterministic rules with explicit uncertainty | Reproducible branch matching is safer than silent model merging |
| Preliminary and final ranking | Deterministic | Preference changes should produce explainable score changes |
| Final explanation | Model constrained to validated evidence IDs | Natural language helps with concise decision communication |
| Output validation | Deterministic | No recommendation may cite a missing evidence ID |

## Request contract

The public request keeps structured location separate from the natural-language need:

```ts
type RecommendationRequest = {
  location: string;
  query: string;
};
```

The interpreted intent distinguishes:

- hard constraints from soft preferences;
- desired cuisine, dishes, flavors, budget, party size, and delivery needs;
- component weights for reputation, evidence, menu, delivery, price, and location.

Weights are normalized by deterministic code. They express relative priority, not scientific measurement.

## Evidence contract

A `SourceRecord` represents one restaurant branch as described by one public source. A record may contain many claims, but every claim inherits the record's observed URL and timestamp.

Important delivery states are ordered but not treated as equivalent:

```text
unknown
listing_found
appears_open
accepting_orders
exact_address_eligible
eta_known
```

The system reports only the highest state directly supported by the source. A listing page usually establishes `listing_found`, not exact-address eligibility.

## Grounding guard

Each provider must expose observed URLs. OpenAI reads Responses API search actions and URL annotations. OpenRouter reads standardized `url_citation` annotations from its Web Search response. After each research pass:

1. collect every URL actually returned by search actions and output annotations;
2. canonicalize URLs without discarding host or path identity;
3. accept extracted records only when their `sourceUrl` matches an observed URL;
4. quarantine ungrounded records and emit a warning;
5. validate final dish and rationale evidence IDs against the accepted record set.

This does not prove that a source is correct. It prevents the model from presenting an unobserved source as retrieved evidence.

## Entity resolution

Automatic merge requires branch-compatible evidence:

- exact Singapore postal code plus compatible normalized name: high confidence;
- exact normalized address plus compatible name: high confidence;
- highly similar name plus matching branch or neighborhood: medium confidence;
- chain name without branch evidence, conflicting postal codes, or conflicting addresses: uncertain and not merged.

Resolution returns both merged restaurants and a list of considered uncertain pairs. Tests cover punctuation variants, parenthetical branches, chain collisions, and missing addresses.

## Evidence quality and ranking

Reputation uses rating quality and review-volume support without displaying a false-precision universal score. Internally, bounded component scores make deterministic ordering possible; the UI shows component labels and supporting facts.

Review volume affects the reliability of a rating through a logarithmic cap. This means moving from 20 to 200 reviews matters more than moving from 2,000 to 2,180. Multi-source coverage, conflicts, and identity certainty then determine the confidence band.

Hard-constraint failures are penalized and made visible. Unknown evidence is not treated as a pass. It receives a neutral or cautious contribution depending on the criterion.

## Research budget

The pipeline has four semantic phases:

1. one intent extraction call;
2. one broad search call with a bounded tool-call budget;
3. one finalist search call with a bounded tool-call budget;
4. one grounded explanation call.

OpenAI normally performs four provider calls. OpenRouter normally performs six because each broad/deep search pass is followed by a separate structured extraction call. Search and model costs remain on the user's selected provider account. Tool-call budgets and models are configurable; fixtures pin behavior without assuming one model alias will remain permanent.

## Interfaces

- `POST /api/recommend` returns `application/x-ndjson` events: operational trace events followed by one final decision packet.
- `GET /api/health` reports configuration readiness without exposing secrets.
- `GET /api/config` reports the current session-safe provider state.
- `POST /api/config` validates and binds one OpenAI or OpenRouter key to an expiring server session.
- `DELETE /api/config` destroys the session credential and clears the cookie.
- `npm run cli -- --location <place> --query <need>` runs the same pipeline locally.

## Failure behavior

- Missing or expired provider session: configuration error before research begins.
- Invalid key or model: setup fails before a paid research run begins.
- Empty or invalid input: 400 response with field-level details.
- No grounded candidates: return a no-decision result with sources and warnings, not a fabricated recommendation.
- Search/model failure: preserve completed trace events and return a typed error event.
- Conflicting evidence: retain both records, reduce confidence, and explain the conflict.
- Request cancellation: propagate the abort signal to provider calls.

## Evaluation strategy

Deterministic tests answer whether normalization, merges, claim grounding, confidence, and ranking behave correctly. A fixture provider runs the complete pipeline without live restaurant assumptions. Live evals measure retrieval recall, source coverage, unsupported hard facts, ranking sensitivity, search count, latency, and cost/usage where reported.

The historical restaurant names in the Thai scenario appear only in eval expectations and fixtures. Production discovery never receives them.

## Explicit non-goals

No accounts, checkout, ordering, restaurant database, private API reverse engineering, anti-bot scraping, CAPTCHA bypass, browser automation, vector database, multi-country support, or dedicated platform integrations are part of V0.
