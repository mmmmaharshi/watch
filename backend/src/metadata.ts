import { Context, Duration, Effect, Fiber, Layer, Option, Schema } from "effect";
import { CINEMETA_HOST, TVMAZE_HOST } from "../../src/consts";
import { Cache } from "./cache";
import { Http } from "./http";

// Metadata failures are one of the five tagged errors from decision #38.
export class MetadataMissing extends Schema.TaggedError<MetadataMissing>()("MetadataMissing", {
  id: Schema.String,
}) {}

export type ContentType = "movie" | "tv";

const TitleMeta = Schema.Struct({
  type: Schema.Literals(["movie", "tv"]),
  name: Schema.String,
  year: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});
export type TitleMeta = typeof TitleMeta.Type;

// Built field by field, so the optional keys only appear when present.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

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
  ) => Effect.Effect<TitleMeta, MetadataMissing>;
}

const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

// Dates arrive in mixed shapes: a bare year, a full date, or a range. The
// first four digits are the year in every shape seen so far.
const yearOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value.match(/^\d{4}/)?.[0] : undefined;

type Kind = "movie" | "series";

interface KindResult {
  readonly meta: TitleMeta | null;
  readonly transient: boolean;
}

const MISS: KindResult = { meta: null, transient: false };

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
            return { meta, transient: false };
          }),
          // A non-ok status is a verified miss; a network or parse failure is not.
          Effect.catchTag("HttpError", (error) =>
            Effect.succeed({ meta: null, transient: error.status === undefined }),
          ),
          Effect.timeoutOption(Duration.millis(REQUEST_TIMEOUT_MS)),
          Effect.map(Option.getOrElse((): KindResult => ({ meta: null, transient: true }))),
        );

      const preferKind = (id: string, preferred: ContentType) =>
        Effect.gen(function* () {
          const firstKind: Kind = preferred === "tv" ? "series" : "movie";
          const first = yield* fetchKind(firstKind, id);
          if (first.meta !== null) {
            return first;
          }
          const second = yield* fetchKind(firstKind === "series" ? "movie" : "series", id);
          return { meta: second.meta, transient: first.transient || second.transient };
        });

      // Both kinds race; the loser is interrupted when the first answers.
      const raceKinds = (id: string) =>
        Effect.scoped(
          Effect.gen(function* () {
            const series = yield* Effect.forkScoped(fetchKind("series", id));
            const movie = yield* Effect.forkScoped(fetchKind("movie", id));
            const first = yield* Effect.race(
              Fiber.join(series).pipe(Effect.map((result) => ({ result, other: movie }))),
              Fiber.join(movie).pipe(Effect.map((result) => ({ result, other: series }))),
            );
            if (first.result.meta !== null) {
              return first.result;
            }
            // A miss on the first finish still lets the other kind answer.
            const second = yield* Fiber.join(first.other);
            return { meta: second.meta, transient: first.result.transient || second.transient };
          }),
        );

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

      const remember = (id: string, meta: TitleMeta) =>
        cache.set(`meta:${id}`, Schema.encodeSync(CachedMeta)(meta), CACHE_TTL_MS);

      // A cache entry is our own JSON; a decode failure reads as a miss.
      const recall = (id: string) =>
        Effect.gen(function* () {
          const value = yield* cache.get(`meta:${id}`);
          return Option.isSome(value)
            ? Schema.decodeUnknownOption(CachedMeta)(value.value)
            : Option.none<TitleMeta>();
        });

      const resolve = Effect.fnUntraced(function* (id: string, preferred?: ContentType) {
        const cached = yield* recall(id);
        if (Option.isSome(cached)) {
          return cached.value;
        }
        if (Option.isSome(yield* cache.get(`miss:${id}`))) {
          return yield* new MetadataMissing({ id });
        }

        const fetched =
          preferred === undefined ? yield* raceKinds(id) : yield* preferKind(id, preferred);
        if (fetched.meta !== null) {
          yield* remember(id, fetched.meta);
          return fetched.meta;
        }

        const fallback = yield* fetchTVMaze(id);
        if (fallback !== null) {
          yield* remember(id, fallback);
          return fallback;
        }

        if (!fetched.transient) {
          yield* cache.set(`miss:${id}`, "1", CACHE_TTL_MS);
        }
        return yield* new MetadataMissing({ id });
      });

      return Metadata.of({ resolve });
    }),
  );
}
