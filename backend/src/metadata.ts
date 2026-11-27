import { Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { CINEMETA_HOST, TVMAZE_HOST } from "../../src/consts";
import { isImdbId } from "../../src/lib/parse-input";
import type { ContentType, Mutable } from "../../src/lib/types";
import { Kind as MediaKind } from "../../src/lib/types";
import { yearOf } from "../../src/lib/year";
import { Cache } from "./cache";
import { Http } from "./http";
import { askWikidata } from "./wikidata";

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
// The ORDER BY keeps a contradictory item on one answer instead of a coin flip.
const typeQuery = (id: string): string =>
  `SELECT ?root WHERE { ?item wdt:P345 "${id}" ; wdt:P31 ?type . ` +
  "?type wdt:P279* ?root . VALUES ?root { wd:Q11424 wd:Q5398426 } } " +
  "ORDER BY ?root LIMIT 1";

// Cinemeta's own two kinds, before the app's movie/tv vocabulary.
type CinemetaKind = "movie" | "series";

const toContentType = (kind: CinemetaKind): ContentType => (kind === "series" ? "tv" : "movie");

const toCinemeta = (type: ContentType): CinemetaKind => (type === "tv" ? "series" : "movie");

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

// A record proves its kind when it says what it is: a series lists episodes, a
// movie carries its own year. Cinemeta's stubs do neither.
const proves = (kind: CinemetaKind, result: KindResult): boolean =>
  result.meta !== null && (kind === "series" ? result.hasEpisodes : result.hasOwnYear);

const miss = (transient: boolean): KindResult => ({ ...MISS, transient });

const otherKind = (kind: CinemetaKind): CinemetaKind => (kind === "series" ? "movie" : "series");

// Prefer the series record when there is one: that is the kind whose stub
// records Cinemeta gets wrong.
const withSeriesFirst = (series: KindResult, movie: KindResult): KindResult =>
  series.meta !== null ? series : movie;

export class Metadata extends Context.Service<Metadata, MetadataShape>()("watch/backend/Metadata") {
  static readonly layer: Layer.Layer<Metadata, never, Cache | Http> = Layer.effect(
    Metadata,
    Effect.gen(function* () {
      const http = yield* Http;
      const cache = yield* Cache;

      const fetchKind = (kind: CinemetaKind, id: string) =>
        http.getJson(`${CINEMETA_HOST}/meta/${kind}/${id}.json`, CinemetaBody).pipe(
          Effect.map((body): KindResult => {
            const m = body.meta;
            if (m === undefined || typeof m.name !== "string" || m.name === "") {
              return MISS;
            }
            const year = yearOf(m.year) ?? yearOf(m.releaseInfo);
            const meta: Mutable<TitleMeta> = {
              type: toContentType(kind),
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
          Effect.catchTag("HttpError", (error) => Effect.succeed(miss(error.status === undefined))),
          Effect.timeoutOption(Duration.millis(REQUEST_TIMEOUT_MS)),
          Effect.map(Option.getOrElse((): KindResult => miss(true))),
        );

      // The deciding vote when Cinemeta cannot prove a kind. A miss, a slow
      // answer or an error leaves the heuristic in charge, so the lookup never
      // fails here.
      const wikidataKind = (id: string) =>
        Effect.gen(function* () {
          if (!isImdbId(id)) {
            return null;
          }
          const answer = yield* askWikidata(http, typeQuery(id), "root").pipe(
            Effect.timeoutOption(Duration.millis(WIKIDATA_TYPE_MS)),
            Effect.catchTag("HttpError", () => Effect.succeed(Option.none())),
          );
          const root = Option.isSome(answer) ? answer.value : undefined;
          if (root === "http://www.wikidata.org/entity/Q11424") {
            return "movie";
          }
          return root === "http://www.wikidata.org/entity/Q5398426" ? "tv" : null;
        });

      // A declared type is the caller's strongest signal, so the preferred
      // record wins as soon as it proves itself. A record that lists episodes
      // outranks a stub even against the hint; with neither proof, Wikidata
      // decides before a stub can name the result.
      const preferKind = (id: string, preferred: ContentType) =>
        Effect.gen(function* () {
          const kind = toCinemeta(preferred);
          const first = yield* fetchKind(kind, id);
          if (first.meta === null) {
            const second = yield* fetchKind(otherKind(kind), id);
            return { ...second, transient: first.transient || second.transient };
          }
          if (proves(kind, first)) {
            return first;
          }
          const other = yield* fetchKind(otherKind(kind), id);
          if (proves(otherKind(kind), other)) {
            return { ...other, transient: first.transient || other.transient };
          }
          const knownKind = yield* wikidataKind(id);
          if (knownKind !== null && knownKind !== preferred && other.meta !== null) {
            return { ...other, transient: first.transient || other.transient };
          }
          return first;
        });

      // Cinemeta keeps a stub movie record for some series ids: tt2661044
      // answers "Yellowknife" (2002) as a movie while the series record holds
      // The 100's episodes. Both kinds are asked. One that proves itself wins
      // outright; otherwise, unless both missed, Wikidata decides.
      const bothKinds = (id: string) =>
        Effect.gen(function* () {
          const [series, movie] = yield* Effect.all(
            [fetchKind("series", id), fetchKind("movie", id)],
            { concurrency: "unbounded" },
          );
          const transient = series.transient || movie.transient;
          const seriesProves = proves("series", series);
          const movieProves = proves("movie", movie);
          if (seriesProves !== movieProves) {
            return { ...(seriesProves ? series : movie), transient };
          }
          if (series.meta === null && movie.meta === null) {
            return miss(transient);
          }
          const knownKind = yield* wikidataKind(id);
          if (knownKind === "tv" && series.meta !== null) {
            return { ...series, transient };
          }
          if (knownKind === "movie" && movie.meta !== null) {
            return { ...movie, transient };
          }
          // No answer, or an answer for the kind that missed: keep the series
          // record when there is one, because the movie side is the stub.
          return { ...withSeriesFirst(series, movie), transient };
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
              ? yield* fetchKind(toCinemeta(preferred), id)
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
          const other = yield* fetchKind(otherKind(toCinemeta(preferred)), id);
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
