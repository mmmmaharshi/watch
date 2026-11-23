import { Clock, Effect, Option, Schema } from "effect";
import {
  BOGUS_ID,
  PROBE_ID,
  buildProvidersJson,
  hasPlayerApi,
  hasSignedSrc,
  isVidFastAlive,
  isVidLinkPairAlive,
  isVidZeeAlive,
  needsRotAlarm,
} from "../../src/lib/provider-probes";
import {
  DIRECTORY_URL,
  VIDFAST,
  VIDLINK,
  VIDZEE,
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

export type RefreshFailureReason =
  | "directory_unreachable_and_stale"
  | "no_providers"
  | "write_failed";

export class RefreshFailed extends Schema.TaggedError<RefreshFailed>()("RefreshFailed", {
  reason: Schema.Literals(["directory_unreachable_and_stale", "no_providers", "write_failed"]),
  detail: Schema.String,
}) {}

export interface RefreshOutcome {
  // false means the directory was down and the stored list is still fresh.
  readonly written: boolean;
  readonly providers: number;
  readonly skipped: ReadonlyArray<string>;
}

// The plain-HTTP probe used by both the Bun script and the Worker: a non-ok
// answer is data, a network failure is an error.
export const fetchProbe =
  (timeoutMs: number): RefreshDeps["probe"] =>
  (url) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return { status: response.status, body: await response.text() };
      },
      catch: (cause) => cause,
    });

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
      if (needsRotAlarm(ageMs)) {
        return yield* new RefreshFailed({
          reason: "directory_unreachable_and_stale",
          detail: `directory fetch failed and the stored list is ${String(ageMs)}ms old`,
        });
      }
      // Fresh enough: keep it. Do not blank a working list.
      return { written: false, providers: current.value.providers.length, skipped: [] };
    }

    const alive: Array<string> = [];
    const skipped: Array<string> = [];
    for (const origin of parseActiveDomains(directory.value.body)) {
      const ok = yield* isVidSrcAlive(deps, origin).pipe(Effect.orElseSucceed(() => false));
      if (ok) {
        alive.push(origin);
      } else {
        skipped.push(origin);
      }
    }

    const vidLink = yield* Effect.gen(function* () {
      const valid = yield* probeEmbed(deps, VIDLINK, PROBE_ID);
      const bogus = yield* probeEmbed(deps, VIDLINK, BOGUS_ID);
      return isVidLinkPairAlive(valid, bogus);
    }).pipe(Effect.orElseSucceed(() => false));
    if (vidLink) {
      alive.push(VIDLINK.baseUrl);
    } else {
      skipped.push(VIDLINK.baseUrl);
    }

    const vidZee = yield* probeEmbed(deps, VIDZEE, PROBE_ID).pipe(Effect.option);
    if (Option.isSome(vidZee) && isVidZeeAlive(vidZee.value.status, vidZee.value.body)) {
      alive.push(VIDZEE.baseUrl);
    } else {
      skipped.push(VIDZEE.baseUrl);
    }

    const vidFast = yield* probeEmbed(deps, VIDFAST, PROBE_ID).pipe(Effect.option);
    const vidFastAlive = Option.isSome(vidFast) && isVidFastAlive(vidFast.value.status);

    const file = buildProvidersJson(
      alive,
      new Date(now).toISOString(),
      vidFastAlive ? [VIDFAST.baseUrl] : [],
    );
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
