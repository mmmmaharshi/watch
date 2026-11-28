import { Clock, Effect, Option, Schedule, Schema } from "effect";
import {
  BOGUS_ID,
  PROBE_ID,
  ROT_ALARM_MS,
  buildProvidersJson,
  hasPlayerApi,
  hasSignedSrc,
  isAlive,
} from "../../src/lib/provider-probes";
import {
  DIRECTORY_URL,
  PROVIDER_TIERS,
  VIDLINK,
  buildEmbedUrl,
  parseActiveDomains,
} from "../../src/lib/providers";
import type { Provider, ProvidersFile } from "../../src/lib/providers";

export interface ProbeResponse {
  readonly status: number;
  readonly body: string;
}

export interface RefreshDeps {
  // Non-ok answers are data, not failures: some probes need the status.
  readonly probe: (url: string) => Effect.Effect<ProbeResponse, unknown>;
  readonly current: Effect.Effect<Option.Option<ProvidersFile>>;
  readonly save: (file: ProvidersFile) => Effect.Effect<void, unknown>;
}

const FAILURE_REASONS = [
  "directory_unreachable_and_stale",
  "no_providers",
  "write_failed",
] as const;

export class RefreshFailed extends Schema.TaggedError<RefreshFailed>()("RefreshFailed", {
  reason: Schema.Literals(FAILURE_REASONS),
  detail: Schema.String,
}) {}

export interface RefreshOutcome {
  // false means the directory was down and the stored list is still fresh.
  readonly written: boolean;
  readonly providers: number;
  readonly skipped: ReadonlyArray<string>;
}

// Three attempts with 1s then 2s backoff: a transient blip must not mark
// a host dead. A non-ok answer stays data (no retry); only a network
// failure retries.
export const probeRetrySchedule = Schedule.max([
  Schedule.exponential("1 second"),
  Schedule.recurs(2),
]);

// The plain-HTTP probe used by both the Bun script and the Worker: a non-ok
// answer is data, a network failure is an error.
export const fetchProbe =
  (
    timeoutMs: number,
    schedule: Schedule.Schedule<unknown, unknown, never, never> = probeRetrySchedule,
  ): RefreshDeps["probe"] =>
  (url) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return { status: response.status, body: await response.text() };
      },
      catch: (cause) => cause,
    }).pipe(Effect.retry(schedule));

const probeEmbed = (deps: RefreshDeps, provider: Provider, id: string) =>
  deps.probe(buildEmbedUrl(provider, "movie", id));

const isVidSrcAlive = (deps: RefreshDeps, origin: string) =>
  Effect.gen(function* () {
    const embed = yield* probeEmbed(
      deps,
      { name: new URL(origin).host, baseUrl: origin },
      PROBE_ID,
    );
    if (!embed.body || !hasPlayerApi(embed.body)) {
      return false;
    }
    const api = yield* deps.probe(`${origin}/vs_src.php?type=movie&id=${PROBE_ID}`);
    return hasSignedSrc(api.body);
  });

// Reads the directory, keeps only hosts that pass a real check, and saves the
// list. The Bun script saves a file; the cron saves KV.
export const runRefresh = (deps: RefreshDeps): Effect.Effect<RefreshOutcome, RefreshFailed> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const directory = yield* deps.probe(DIRECTORY_URL).pipe(Effect.option);

    if (Option.isNone(directory)) {
      const current = yield* deps.current;
      if (Option.isNone(current)) {
        return yield* new RefreshFailed({
          reason: "directory_unreachable_and_stale",
          detail: "directory fetch failed and no stored list exists",
        });
      }
      const updatedAt = Date.parse(current.value.updatedAt);
      const ageMs = Number.isNaN(updatedAt) ? null : now - updatedAt;
      if (ageMs === null || ageMs > ROT_ALARM_MS) {
        return yield* new RefreshFailed({
          reason: "directory_unreachable_and_stale",
          detail: `directory fetch failed and the stored list is ${String(ageMs)}ms old`,
        });
      }
      // Fresh enough: keep it. Do not blank a working list.
      return { written: false, providers: current.value.providers.length, skipped: [] };
    }

    const checked = yield* Effect.forEach(
      parseActiveDomains(directory.value.body),
      (origin) =>
        isVidSrcAlive(deps, origin).pipe(
          Effect.map((ok) => ({ origin, ok })),
          Effect.orElseSucceed(() => ({ origin, ok: false })),
        ),
      { concurrency: 4 },
    );
    const alive = checked.filter((one) => one.ok).map((one) => one.origin);
    const skipped = checked.filter((one) => !one.ok).map((one) => one.origin);

    // The stored file holds only the VidSrc domains: they are the only hosts
    // with the default /embed shape. Every static provider is still probed, so
    // a dead one is named in the log.
    const health = yield* Effect.forEach(
      PROVIDER_TIERS.flat(),
      (spec) =>
        Effect.gen(function* () {
          const provider = spec.provider;
          const valid = yield* probeEmbed(deps, provider, PROBE_ID);
          if (provider.name !== VIDLINK.name) {
            return { provider, ok: isAlive(provider, valid) };
          }
          const bogus = yield* probeEmbed(deps, provider, BOGUS_ID);
          return { provider, ok: isAlive(provider, valid) && !isAlive(provider, bogus) };
        }).pipe(Effect.orElseSucceed(() => ({ provider: spec.provider, ok: false }))),
      { concurrency: 4 },
    );
    skipped.push(...health.filter((one) => !one.ok).map((one) => one.provider.baseUrl));

    const file = buildProvidersJson(alive, new Date(now).toISOString());
    if (!file.providers.length) {
      return yield* new RefreshFailed({
        reason: "no_providers",
        detail: `nothing passed its probe: ${skipped.join(", ")}`,
      });
    }

    yield* deps
      .save(file)
      .pipe(
        Effect.mapError(
          (cause) => new RefreshFailed({ reason: "write_failed", detail: String(cause) }),
        ),
      );
    return { written: true, providers: file.providers.length, skipped };
  });
