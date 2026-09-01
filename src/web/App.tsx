import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  ListMagnifyingGlass,
  MagnifyingGlass,
  MapPin,
  Moon,
  ShieldCheck,
  StopCircle,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  DecisionPacket,
  ProviderPublicState,
  TraceEvent,
} from "../shared/types";
import {
  fetchProviderConfig,
  FoodLensApiError,
  researchRestaurants,
} from "./api";
import { ProviderSetup } from "./components/ProviderSetup";
import { RecommendationView } from "./components/RecommendationView";
import { TracePanel } from "./components/TracePanel";

const EXAMPLE_LOCATION = "Pasir Panjang, Singapore";
const EXAMPLE_QUERY =
  "I want Thai food delivery around SGD 30 or below. Strong ratings on both Google and Foodpanda matter, especially when supported by many reviews. I want Pad See Ew or something savory and strongly flavored, such as basil pork.";

function scrollPageTop(): void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export default function App() {
  const [location, setLocation] = useState(EXAMPLE_LOCATION);
  const [query, setQuery] = useState(EXAMPLE_QUERY);
  const [providerState, setProviderState] = useState<ProviderPublicState | null>(null);
  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const [darkTheme, setDarkTheme] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [packet, setPacket] = useState<DecisionPacket | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchProviderConfig()
      .then(setProviderState)
      .catch(() =>
        setProviderState({
          configured: false,
          provider: null,
          model: null,
          source: null,
          expiresAt: null,
          sessionOnly: true,
        }),
      );
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
  }, [darkTheme]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (running) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setRunning(true);
    setPacket(null);
    setTrace([]);
    setError(null);
    try {
      const result = await researchRestaurants(
        { location, query },
        {
          signal: abort.signal,
          onTrace: (next) => setTrace((current) => [...current, next]),
        },
      );
      setPacket(result);
      requestAnimationFrame(scrollPageTop);
    } catch (caught) {
      if (!abort.signal.aborted) {
        if (
          caught instanceof FoodLensApiError &&
          caught.code === "provider_not_configured"
        ) {
          setProviderState(await fetchProviderConfig().catch(() => providerState));
          setShowProviderSetup(true);
        }
        setError(caught instanceof Error ? caught.message : "Research failed.");
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setError("Research cancelled. Completed trace events are preserved below.");
  };

  const startAnother = () => {
    setPacket(null);
    setTrace([]);
    setError(null);
    scrollPageTop();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FoodLens SG home">
          <span className="brand-mark">FL</span>
          <span>
            <strong>FoodLens SG</strong>
            <small>Search. Structure. Decide.</small>
          </span>
        </a>
        <div className="top-actions">
          <div className="server-state">
            {providerState?.provider === "fixture" ? (
              <>
                <WarningCircle aria-hidden /> Fixture mode
              </>
            ) : providerState?.configured ? (
              <>
                <CheckCircle aria-hidden weight="fill" />
                <span title={providerState.model ?? undefined}>
                  {providerState.provider === "openrouter" ? "OpenRouter" : "OpenAI"}
                </span>
              </>
            ) : providerState ? (
              <>
                <WarningCircle aria-hidden /> Provider required
              </>
            ) : (
              <>Checking server</>
            )}
          </div>
          {providerState?.configured && providerState.provider !== "fixture" ? (
            <button
              aria-label="Change provider"
              className="theme-toggle"
              onClick={() => {
                setPacket(null);
                setTrace([]);
                setError(null);
                setShowProviderSetup(true);
                scrollPageTop();
              }}
              title="Change provider"
              type="button"
            >
              <ArrowsClockwise aria-hidden />
            </button>
          ) : null}
          <button
            aria-label={darkTheme ? "Use light theme" : "Use dark theme"}
            className="theme-toggle"
            onClick={() => setDarkTheme((current) => !current)}
            title={darkTheme ? "Use light theme" : "Use dark theme"}
            type="button"
          >
            {darkTheme ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </button>
        </div>
      </header>

      <main>
        {providerState === null ? (
          <div className="provider-loading" role="status">
            Checking provider configuration
          </div>
        ) : showProviderSetup || !providerState.configured ? (
          <ProviderSetup
            current={providerState}
            onCancel={
              providerState.configured ? () => setShowProviderSetup(false) : undefined
            }
            onConnected={(state) => {
              setProviderState(state);
              setShowProviderSetup(!state.configured);
              setError(null);
              scrollPageTop();
            }}
          />
        ) : !packet ? (
          <section className="request-layout">
            <div className="request-copy">
              <p className="eyebrow">Singapore restaurant research</p>
              <h1>One dinner decision, with the evidence attached.</h1>
              <p className="intro">
                Describe what matters now. FoodLens searches broadly, resolves branches,
                checks evidence quality, and recommends what to order.
              </p>

              <form onSubmit={submit} className="decision-form">
                <label>
                  <span>Delivery area or location</span>
                  <span className="input-wrap">
                    <MapPin aria-hidden />
                    <input
                      autoComplete="street-address"
                      disabled={running}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="Pasir Panjang, Singapore"
                      required
                      value={location}
                    />
                  </span>
                  <small>Use a neighborhood, landmark, or Singapore postal code.</small>
                </label>

                <label>
                  <span>What do you want to eat?</span>
                  <textarea
                    disabled={running}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cuisine, budget, delivery needs, dishes, flavors, and what matters most."
                    required
                    rows={4}
                    value={query}
                  />
                  <small>Hard limits and softer preferences can live in the same sentence.</small>
                </label>

                {error ? (
                  <div className="form-error" role="alert">
                    <WarningCircle aria-hidden />
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="form-actions">
                  {running ? (
                    <button className="button button-stop" onClick={cancel} type="button">
                      <StopCircle aria-hidden />
                      Cancel research
                    </button>
                  ) : (
                    <button className="button button-primary" type="submit">
                      <MagnifyingGlass aria-hidden weight="bold" />
                      Research restaurants
                      <ArrowRight aria-hidden />
                    </button>
                  )}
                  <button
                    className="button button-quiet"
                    disabled={running}
                    onClick={() => {
                      setLocation(EXAMPLE_LOCATION);
                      setQuery(EXAMPLE_QUERY);
                    }}
                    type="button"
                  >
                    Load Thai example
                  </button>
                </div>
              </form>
            </div>

            <aside className="trust-panel" aria-label="Research contract">
              <div className="trust-heading">
                <ShieldCheck aria-hidden weight="duotone" />
                <div>
                  <h2>Evidence before confidence</h2>
                  <p>Unknown facts stay unknown.</p>
                </div>
              </div>
              <div className="trust-rows">
                <div>
                  <ListMagnifyingGlass aria-hidden />
                  <span>
                    <strong>Candidate recall</strong>
                    Broad discovery happens before the shortlist.
                  </span>
                </div>
                <div>
                  <MapPin aria-hidden />
                  <span>
                    <strong>Branch identity</strong>
                    Similar names do not force an automatic merge.
                  </span>
                </div>
                <div>
                  <ShieldCheck aria-hidden />
                  <span>
                    <strong>Source membership</strong>
                    Unobserved source URLs are rejected from the decision.
                  </span>
                </div>
              </div>
              <div className="boundary-note">
                A Foodpanda listing does not prove exact-address delivery or a current ETA.
              </div>
            </aside>
          </section>
        ) : (
          <>
            <div className="result-actions">
              <button className="button button-quiet" onClick={startAnother} type="button">
                New search
              </button>
            </div>
            <RecommendationView packet={packet} />
          </>
        )}

        {!packet && trace.length > 0 ? (
          <div className="live-trace">
            <TracePanel events={trace} />
          </div>
        ) : null}
      </main>

      <footer>
        <span>FoodLens SG</span>
        <span>Public-web evidence can change. Verify before ordering.</span>
      </footer>
    </div>
  );
}
