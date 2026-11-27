import { Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { CINEMETA_HOST, TVMAZE_HOST, USER_AGENT, WIKIDATA_HOST } from "../../src/consts";
import { isImdbId } from "../../src/lib/parse-input";
import type { ContentType, Mutable } from "../../src/lib/types";
import { Kind as MediaKind } from "../../src/lib/types";
import { yearOf } from "../../src/lib/year";
import { Cache } from "./cache";
import { Http } from "./http";

// Metadata failures are one of the five tagged errors from decision #38.
export class MetadataMissing extends Schema.TaggedError<MetadataMissing>()("MetadataMissing", {
  id: Schema.String,
}) {}

const TitleMeta = Schema.Struct({
  type: MediaKind,
  name: Schema.String,
  year: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});
export type TitleMeta = typeof TitleMeta.Type;

const CachedMeta = Schema.fromJsonString(TitleMeta);

// Upstream bodies are untrusted, so only the fields we read are declared.
const CinemetaBody = Schema.Struct({
  meta: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.Unknown),
      year: Schema.optional(Schema.Unknown),
      releaseInfo: Schema.optional(Schema.Unknown),
      imdbRating: Schema.optional(Schema.Unknown),
      description: Schema.optional(Schema.Unknown),
      videos: Schema.optional(Schema.Array(Schema.Unknown)),
    }),
  ),
});

const TVMazeShow = Schema.Struct({
  name: Schema.optional(Schema.Unknown),
  premiered: Schema.optional(Schema.Unknown),
  summary: Schema.optional(Schema.Unknown),
});

export interface MetadataShape {
  readonly resolve: (
    id: string,
    preferred?: ContentType,
    strict?: boolean,
  ) => Effect.Effect<TitleMeta, MetadataMissing>;
}

const REQUEST_TIMEOUT_MS = 5000;
const WIKIDATA_TYPE_MS = 2000;
const CACHE_TTL_MS = 60_000;

// P31 is the item class. Film (Q11424) and series (Q5398426) items often sit
// under a subclass — miniseries, anime series — so the P279* walk is required.
const TypeAnswer = Schema.Struct({
  results: Schema.optional(
    Schema.Struct({
      bindings: Schema.optional(
        Schema.Array(
          Schema.Struct({
            root: Schema.optional(Schema.Struct({ value: Schema.optional(Schema.String) })),
          }),
        ),
      ),
    }),
  ),
});

const typeUrl = (id: string): string => {
  const query =
    `SELECT ?root WHERE { ?item wdt:P345 "${id}" ; wdt:P31 ?type . ` +
    "?type wdt:P279* ?root . VALUES ?root { wd:Q11424 wd:Q5398426 } } LIMIT 1";
  return `${WIKIDATA_HOST}/sparql?query=${encodeURIComponent(query)}&format=json`;
};

type Kind = "movie" | "series";

interface KindResult {
  readonly meta: TitleMeta | null;
  readonly transient: boolean;
  /** The series record lists episodes; always false for a movie. */
  readonly hasEpisodes: boolean;
  /** The record carried its own `year`; Cinemeta's stubs leave it empty. */
  readonly hasOwnYear: boolean;
}

const MISS: KindResult = {
  meta: null,
  transient: false,
  hasEpisodes: false,
  hasOwnYear: false,
};

export class Metadata extends Context.Service<Metadata, MetadataShape>()("watch/backend/Metadata") {
  static readonly layer: Layer.Layer<Metadata, never, Cache | Http> = Layer.effect(
    Metadata,
    Effect.gen(function* () {
      const http = yield* Http;
      const cache = yield* Cache;

      const fetchKind = (kind: Kind, id: string) =>
        http.getJson(`${CINEMETA_HOST}/meta/${kind}/${id}.json`, CinemetaBody).pipe(
          Effect.map((body): KindResult => {
            const m = body.meta;
            if (m === undefined || typeof m.name !== "string" || m.name === "") {
              return MISS;
            }
            const year = yearOf(m.year) ?? yearOf(m.releaseInfo);
            const meta: Mutable<TitleMeta> = {
              type: kind === "series" ? "tv" : "movie",
              name: m.name,
            };
            if (year !== undefined) {
              meta.year = year;
            }
            if (typeof m.imdbRating === "string") {
              meta.rating = m.imdbRating;
            }
            if (typeof m.description === "string") {
              meta.description = m.description;
            }
            return {
              meta,
              transient: false,
              hasEpisodes: kind === "series" && (m.videos?.length ?? 0) > 0,
              hasOwnYear: yearOf(m.year) !== undefined,
            };
          }),
          // A non-ok status is a verified miss; a network or parse failure is not.
          Effect.catchTag("HttpError", (error) =>
            Effect.succeed({ ...MISS, transient: error.status === undefined }),
          ),
          Effect.timeoutOption(Duration.millis(REQUEST_TIMEOUT_MS)),
          Effect.map(Option.getOrElse((): KindResult => ({ ...MISS, transient: true }))),
        );

      const preferKind = (id: string, preferred: ContentType) =>
        Effect.gen(function* () {
          const firstKind: Kind = preferred === "tv" ? "series" : "movie";
          const first = yield* fetchKind(firstKind, id);
          if (first.meta !== null) {
            return first;
          }
          const second = yield* fetchKind(firstKind === "series" ? "movie" : "series", id);
          return { ...second, transient: first.transient || second.transient };
        });

      // Cinemeta keeps a stub movie record for some series ids: tt2661044
      // answers "Yellowknife" (2002) as a movie while the series record holds
      // The 100's episodes. Both kinds are asked. One that proves itself — a
      // series listing episodes, or a movie carrying its own year — wins
      // outright; when both do, or neither does, Wikidata decides.
      const bothKinds = (id: string) =>
        Effect.gen(function* () {
          const [series, movie] = yield* Effect.all(
            [fetchKind("series", id), fetchKind("movie", id)],
            { concurrency: "unbounded" },
          );
          const transient = series.transient || movie.transient;
          const seriesProves = series.meta !== null && series.hasEpisodes;
          const movieProves = movie.meta !== null && movie.hasOwnYear;
          if (seriesProves !== movieProves) {
            return { ...(seriesProves ? series : movie), transient };
          }
          if (series.meta === null && movie.meta === null) {
            return { ...MISS, transient };
          }
          const known = yield* fetchType(id);
          if (known === "tv" && series.meta !== null) {
            return { ...series, transient };
          }
          if (known === "movie" && movie.meta !== null) {
            return { ...movie, transient };
          }
          // No answer, or an answer for the kind that missed: keep the series,
          // the kind whose stub records Cinemeta gets wrong.
          return { ...(series.meta !== null ? series : movie), transient };
        });

      const fetchTVMaze = (id: string) =>
        Effect.gen(function* () {
          const show = yield* http
            .getJson(`${TVMAZE_HOST}/lookup/shows?imdb=${id}`, TVMazeShow)
            .pipe(
              Effect.timeoutOption(Duration.millis(REQUEST_TIMEOUT_MS)),
              Effect.catchTag("HttpError", () =>
                Effect.succeed(Option.none<typeof TVMazeShow.Type>()),
              ),
            );
          if (Option.isNone(show)) {
            return null;
          }
          const m = show.value;
          if (typeof m.name !== "string") {
            return null;
          }
          const year = yearOf(m.premiered);
          const summary =
            typeof m.summary === "string" ? m.summary.replaceAll(/<[^>]*>/g, "").trim() : undefined;
          const meta: Mutable<TitleMeta> = { type: "tv", name: m.name };
          if (year !== undefined) {
            meta.year = year;
          }
          if (summary !== undefined) {
            meta.description = summary;
          }
          return meta;
        });

      // The deciding vote when both Cinemeta kinds look real. A miss or a slow
      // answer leaves the heuristic in charge, so the lookup never fails here.
      const fetchType = (id: string) =>
        Effect.gen(function* () {
          if (!isImdbId(id)) {
            return null;
          }
          const answer = yield* http
            .getJson(typeUrl(id), TypeAnswer, { "User-Agent": USER_AGENT })
            .pipe(
              Effect.timeoutOption(Duration.millis(WIKIDATA_TYPE_MS)),
              Effect.catchTag("HttpError", () => Effect.succeed(Option.none())),
            );
          const root = Option.isSome(answer)
            ? answer.value.results?.bindings?.[0]?.root?.value
            : undefined;
          if (root === "http://www.wikidata.org/entity/Q11424") {
            return "movie";
          }
          return root === "http://www.wikidata.org/entity/Q5398426" ? "tv" : null;
        });

      const remember = (cacheKind: ContentType | "any", id: string, meta: TitleMeta) =>
        cache.set(`meta:${cacheKind}:${id}`, Schema.encodeSync(CachedMeta)(meta), CACHE_TTL_MS);

      // A cache entry is our own JSON; a decode failure reads as a miss.
      const recall = (cacheKind: ContentType | "any", id: string) =>
        Effect.gen(function* () {
          const value = yield* cache.get(`meta:${cacheKind}:${id}`);
          return Option.isSome(value)
            ? Schema.decodeUnknownOption(CachedMeta)(value.value)
            : Option.none<TitleMeta>();
        });

      const resolve = Effect.fnUntraced(function* (
        id: string,
        preferred?: ContentType,
        strict = false,
      ) {
        const cacheKind = preferred ?? "any";
        const cached = yield* recall(cacheKind, id);
        if (Option.isSome(cached)) {
          return cached.value;
        }
        if (Option.isSome(yield* cache.get(`miss:${cacheKind}:${id}`))) {
          return yield* new MetadataMissing({ id });
        }

        const fetched =
          preferred === undefined
            ? yield* bothKinds(id)
            : strict
              ? yield* fetchKind(preferred === "tv" ? "series" : "movie", id)
              : yield* preferKind(id, preferred);
        if (fetched.meta !== null) {
          yield* remember(cacheKind, id, fetched.meta);
          return fetched.meta;
        }

        const fallback = strict && preferred === "movie" ? null : yield* fetchTVMaze(id);
        if (fallback !== null) {
          yield* remember(cacheKind, id, fallback);
          return fallback;
        }

        if (strict && preferred !== undefined) {
          const other = yield* fetchKind(preferred === "tv" ? "movie" : "series", id);
          if (other.meta !== null) {
            const meta = { ...other.meta, type: preferred };
            yield* remember(cacheKind, id, meta);
            return meta;
          }
        }

        if (!fetched.transient) {
          yield* cache.set(`miss:${cacheKind}:${id}`, "1", CACHE_TTL_MS);
        }
        return yield* new MetadataMissing({ id });
      });

      return Metadata.of({ resolve });
    }),
  );
}
