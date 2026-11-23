import { KV, Worker, Workers } from "@alchemy.run/cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { PROBE_TIMEOUT_MS } from "../../src/lib/provider-probes";
import { ProviderListKv } from "./cloudflare";
import { providerListFromKv } from "./provider-list";
import { fetchProbe, runRefresh } from "./refresh";
import { REFRESH_CRON, REFRESH_WORKER } from "./resources";

// The cron runs in its own Worker: the Website resource owns the site's
// Worker, and a scheduled handler here keeps the probe code out of the page
// bundle. A failing handler does not crash the Worker, so every outcome is
// logged.
export default Worker(
  REFRESH_WORKER,
  { main: import.meta.url },
  Effect.gen(function* () {
    const kv = yield* KV.ReadWriteNamespace(ProviderListKv);
    // phantom satisfies the binding client's runtime-context type without
    // replacing the real context the Worker provides.
    const raw = yield* kv.raw.pipe(Effect.provide(RuntimeContext.phantom));
    const providerList = providerListFromKv(raw);

    yield* Workers.cron(REFRESH_CRON, () =>
      runRefresh({
        probe: fetchProbe(PROBE_TIMEOUT_MS),
        current: providerList.load,
        save: providerList.save,
      }).pipe(
        Effect.tap((outcome) =>
          Effect.logInfo(
            outcome.written
              ? `Stored ${outcome.providers} providers.`
              : `Directory unreachable; kept ${outcome.providers} providers.`,
          ),
        ),
        Effect.catchCause((cause) => Effect.logError("provider refresh failed", cause)),
      ),
    );

    return {
      fetch: Effect.succeed(HttpServerResponse.text("provider refresh worker")),
    };
  }).pipe(
    Effect.provide(KV.ReadWriteNamespaceBinding),
    Effect.provide(Workers.CronEventSourceLive),
  ),
);
