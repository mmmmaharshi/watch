import { Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { isLooseJson } from "../../src/lib/http";
import { Candidate as CandidateSchema, Official } from "../../src/lib/types";
import type { Candidate, Kind, Mutable } from "../../src/lib/types";
import { yearOf } from "../../src/lib/year";
import { Cache } from "./cache";
import { Http } from "./http";

// TMDB needs a free API key. The layer receives it, so nothing here reads
// configuration at runtime.
const API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const MAX_RESULTS = 6;
// TMDB returns 20 rows a page, so two pages cover a language's matching rows
// for most title searches.
// shortcut: pages 3+ are not searched; fetch more when a real title comes back
// empty for a language it is in.
const MAX_PAGES = 2;
const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const OFFICIAL_TTL_MS = 6 * 60 * 60 * 1000;

export interface TmdbSearchInput {
  readonly query: string;
  readonly kind: Kind;
  readonly language: string;
}

export interface TmdbOfficialInput {
  readonly imdbId: string;
  readonly kind: Kind;
  readonly region: string;
}

export interface TmdbShape {
  readonly configured: boolean;
  // None means the search failed upstream, not that nothing matched.
  readonly search: (
    input: TmdbSearchInput,
  ) => Effect.Effect<Option.Option<ReadonlyArray<Candidate>>>;
  readonly official: (input: TmdbOfficialInput) => Effect.Effect<Option.Option<Official>>;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const idOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

const media = (kind: Kind): "movie" | "tv" => (kind === "tv" ? "tv" : "movie");

const CachedCandidates = Schema.fromJsonString(Schema.Array(CandidateSchema));
const CachedOfficial = Schema.fromJsonString(Official);

export class Tmdb extends Context.Service<Tmdb, TmdbShape>()("watch/backend/Tmdb") {
  static readonly disabledLayer: Layer.Layer<Tmdb> = Layer.succeed(
    Tmdb,
    Tmdb.of({
      configured: false,
      search: () => Effect.succeed(Option.none()),
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

        const imdbIdOf = (id: number, kind: Kind) =>
          getJson(`/${media(kind)}/${id}/external_ids`).pipe(
            Effect.map((body) => (isLooseJson(body) ? (str(body.imdb_id) ?? null) : null)),
          );

        const toCandidate = (row: unknown, kind: Kind) =>
          Effect.gen(function* () {
            if (!isLooseJson(row)) {
              return null;
            }
            const id = idOf(row.id);
            const name = str(media(kind) === "tv" ? row.name : row.title);
            if (id === undefined || name === undefined) {
              return null;
            }
            const imdbId = yield* imdbIdOf(id, kind);
            if (imdbId === null) {
              return null;
            }
            const candidate: Mutable<Candidate> = { imdbId, name, kind };
            const year = yearOf(str(row.release_date) ?? str(row.first_air_date));
            if (year !== undefined) {
              candidate.year = year;
            }
            const poster = str(row.poster_path);
            if (poster !== undefined) {
              candidate.poster = `${IMAGE_BASE}${poster}`;
            }
            return candidate;
          });

        const searchPage = (input: TmdbSearchInput, page: number) =>
          getJson(
            `/search/${media(input.kind)}?query=${encodeURIComponent(input.query)}&page=${page}`,
          );

        const search = Effect.fnUntraced(function* (input: TmdbSearchInput) {
          const cleaned = input.query.trim();
          const cacheKey = `tmdb:search:${input.kind}:${input.language}:${cleaned.toLowerCase()}`;
          const cached = yield* cache.get(cacheKey);
          if (Option.isSome(cached)) {
            const decoded = Schema.decodeUnknownOption(CachedCandidates)(cached.value);
            if (Option.isSome(decoded)) {
              return Option.some(decoded.value);
            }
          }

          const matching: Array<unknown> = [];
          for (let page = 1; page <= MAX_PAGES && matching.length < MAX_RESULTS; page += 1) {
            const body = yield* searchPage({ ...input, query: cleaned }, page);
            if (body === undefined || !isLooseJson(body) || !Array.isArray(body.results)) {
              return Option.none();
            }
            for (const row of body.results) {
              if (isLooseJson(row) && row.original_language === input.language) {
                matching.push(row);
                if (matching.length === MAX_RESULTS) {
                  break;
                }
              }
            }
            const totalPages = typeof body.total_pages === "number" ? body.total_pages : page;
            if (body.results.length === 0 || page >= totalPages) {
              break;
            }
          }

          const resolved = yield* Effect.forEach(matching, (row) => toCandidate(row, input.kind));
          const candidates = resolved.filter(
            (candidate): candidate is Candidate => candidate !== null,
          );
          yield* cache.set(
            cacheKey,
            Schema.encodeSync(CachedCandidates)(candidates),
            SEARCH_TTL_MS,
          );
          return Option.some(candidates);
        });

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

        return Tmdb.of({ configured: true, search, official });
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
