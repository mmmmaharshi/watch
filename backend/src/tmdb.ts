import { Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { isLooseJson } from "../../src/lib/http";
import { Official } from "../../src/lib/types";
import type { Kind } from "../../src/lib/types";
import { Cache } from "./cache";
import { Http } from "./http";

// TMDB needs a free API key. The layer receives it, so nothing here reads
// configuration at runtime.
const API = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 8000;
const OFFICIAL_TTL_MS = 6 * 60 * 60 * 1000;

export interface TmdbOfficialInput {
  readonly imdbId: string;
  readonly kind: Kind;
  readonly region: string;
}

export interface TmdbShape {
  readonly configured: boolean;
  readonly official: (input: TmdbOfficialInput) => Effect.Effect<Option.Option<Official>>;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const idOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

const media = (kind: Kind): "movie" | "tv" => (kind === "tv" ? "tv" : "movie");

const CachedOfficial = Schema.fromJsonString(Official);

export class Tmdb extends Context.Service<Tmdb, TmdbShape>()("watch/backend/Tmdb") {
  static readonly disabledLayer: Layer.Layer<Tmdb> = Layer.succeed(
    Tmdb,
    Tmdb.of({
      configured: false,
      official: () => Effect.succeed(Option.none()),
    }),
  );

  static readonly layer = (key: string): Layer.Layer<Tmdb, never, Http | Cache> =>
    Layer.effect(
      Tmdb,
      Effect.gen(function* () {
        const http = yield* Http;
        const cache = yield* Cache;

        const getJson = (path: string) =>
          http
            .getJson(
              `${API}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`,
              Schema.Unknown,
            )
            .pipe(
              Effect.timeoutOption(Duration.millis(REQUEST_TIMEOUT_MS)),
              Effect.map(Option.getOrUndefined),
              Effect.orElseSucceed(() => undefined),
            );

        const official = Effect.fnUntraced(function* (input: TmdbOfficialInput) {
          const cacheKey = `tmdb:official:${input.region}:${input.kind}:${input.imdbId}`;
          const cached = yield* cache.get(cacheKey);
          if (Option.isSome(cached)) {
            if (cached.value === "none") {
              return Option.none<Official>();
            }
            const decoded = Schema.decodeUnknownOption(CachedOfficial)(cached.value);
            if (Option.isSome(decoded)) {
              return Option.some(decoded.value);
            }
          }

          const found = yield* getJson(
            `/find/${encodeURIComponent(input.imdbId)}?external_source=imdb_id`,
          );
          const list =
            found !== undefined && isLooseJson(found)
              ? media(input.kind) === "tv"
                ? found.tv_results
                : found.movie_results
              : undefined;
          const first = Array.isArray(list) ? list[0] : undefined;
          const id = isLooseJson(first) ? idOf(first.id) : undefined;
          let result: Option.Option<Official> = Option.none();
          if (id !== undefined) {
            const providers = yield* getJson(`/${media(input.kind)}/${id}/watch/providers`);
            const region =
              providers !== undefined && isLooseJson(providers) && isLooseJson(providers.results)
                ? providers.results[input.region]
                : undefined;
            result = Option.fromNullishOr(servicesIn(region));
          }

          yield* cache.set(
            cacheKey,
            Option.isNone(result) ? "none" : Schema.encodeSync(CachedOfficial)(result.value),
            OFFICIAL_TTL_MS,
          );
          return result;
        });

        return Tmdb.of({ configured: true, official });
      }),
    );
}

// Included with a subscription or free with ads. Rent and buy are left out
// because they are not what a visitor means by "it is on Netflix".
const BUCKETS = ["flatrate", "free", "ads"] as const;

const servicesIn = (region: unknown): Official | undefined => {
  if (!isLooseJson(region)) {
    return undefined;
  }
  const services = new Set<string>();
  for (const bucket of BUCKETS) {
    const entries = region[bucket];
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      const name = isLooseJson(entry) ? str(entry.provider_name) : undefined;
      if (name !== undefined) {
        services.add(name);
      }
    }
  }
  const link = str(region.link);
  if (services.size === 0 || link === undefined) {
    return undefined;
  }
  return { services: [...services], link };
};
