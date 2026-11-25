import { Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { CINEMETA_HOST, TVMAZE_HOST, USER_AGENT } from "../../src/consts";
import { LANGUAGE_NEEDS_KEY, SEARCH_FAILED } from "../../src/lib/messages";
import { parseCinemeta, parseTVMaze, sortResults } from "../../src/lib/search";
import { Candidate } from "../../src/lib/types";
import type { SearchInput, SearchOutcome } from "../../src/lib/types";
import { Cache } from "./cache";
import { Http } from "./http";
import { Tmdb } from "./tmdb";

const CINEMETA = `${CINEMETA_HOST}/catalog`;
const TVMAZE = `${TVMAZE_HOST}/search/shows?q=`;
const TIMEOUT_MS = 5000;
// Each catalog returns 20 rows. Keep the relevant head so a dozen obscure
// remakes cannot push the best-known title out of the year-sorted list.
const SOURCE_LIMIT = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;

const CachedCandidates = Schema.fromJsonString(Schema.Array(Candidate));

export interface SearchShape {
  readonly search: (input: SearchInput) => Effect.Effect<SearchOutcome>;
}

const cinemetaUrl = (source: "movie" | "series", query: string): string =>
  `${CINEMETA}/${source}/top/search=${encodeURIComponent(query)}.json`;

export class Search extends Context.Service<Search, SearchShape>()("watch/backend/Search") {
  static readonly layer: Layer.Layer<Search, never, Http | Cache | Tmdb> = Layer.effect(
    Search,
    Effect.gen(function* () {
      const http = yield* Http;
      const cache = yield* Cache;
      const tmdb = yield* Tmdb;

      // Null means the request failed or the body was not the expected JSON.
      const fetchWith = <A>(url: string, parse: (value: unknown) => A | null) =>
        http.getJson(url, Schema.Unknown, { "User-Agent": USER_AGENT }).pipe(
          Effect.timeoutOption(Duration.millis(TIMEOUT_MS)),
          Effect.map((option) => (Option.isSome(option) ? parse(option.value) : null)),
          Effect.orElseSucceed(() => null),
        );

      const respond = (key: string, candidates: Array<Candidate>): Effect.Effect<SearchOutcome> =>
        cache
          .set(key, Schema.encodeSync(CachedCandidates)(candidates), CACHE_TTL_MS)
          .pipe(Effect.as({ ok: true as const, candidates }));

      const search = Effect.fnUntraced(function* (input: SearchInput) {
        const cleaned = input.query.trim();
        const key = `search:${input.kind}:${input.language}:${cleaned.toLowerCase()}`;
        const cached = yield* cache.get(key);
        if (Option.isSome(cached)) {
          const decoded = Schema.decodeUnknownOption(CachedCandidates)(cached.value);
          if (Option.isSome(decoded)) {
            return { ok: true as const, candidates: decoded.value };
          }
        }
        if (cleaned === "") {
          return { ok: true as const, candidates: [] };
        }

        if (input.language !== "") {
          if (!tmdb.configured) {
            return { ok: false as const, error: LANGUAGE_NEEDS_KEY };
          }
          const found = yield* tmdb.search({
            query: cleaned,
            kind: input.kind,
            language: input.language,
          });
          return Option.isNone(found)
            ? { ok: false as const, error: SEARCH_FAILED }
            : yield* respond(key, sortResults([...found.value]));
        }

        if (input.kind === "movie") {
          const movies = yield* fetchWith(cinemetaUrl("movie", cleaned), (value) =>
            parseCinemeta(value, "movie"),
          );
          if (movies === null) {
            return { ok: false as const, error: SEARCH_FAILED };
          }
          return yield* respond(key, sortResults(movies.slice(0, SOURCE_LIMIT)));
        }

        const shows = yield* fetchWith(cinemetaUrl("series", cleaned), (value) =>
          parseCinemeta(value, "tv"),
        );
        // Cinemeta is undocumented, so shows get a second source. Ask it when
        // the series catalog failed or came back empty.
        const seriesPool = shows ?? [];
        const tvmaze =
          shows === null || seriesPool.length === 0
            ? yield* fetchWith(TVMAZE + encodeURIComponent(cleaned), parseTVMaze)
            : null;
        if (shows === null && tvmaze === null) {
          return { ok: false as const, error: SEARCH_FAILED };
        }
        return yield* respond(
          key,
          sortResults([...seriesPool, ...(tvmaze ?? []).slice(0, SOURCE_LIMIT)]),
        );
      });

      return Search.of({ search });
    }),
  );
}
