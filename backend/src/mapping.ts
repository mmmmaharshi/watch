import { Context, Effect, Layer, Schema } from "effect";
import { USER_AGENT } from "../../src/consts";
import type { HttpError } from "./http";
import { Http } from "./http";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Wikidata stores TMDB movie IDs in P4947 and TMDB TV IDs in P4983.
const ID_PROPERTY = { movie: "P4947", tv: "P4983" } as const;

type TitleType = "movie" | "tv";

const wikidataUrl = (property: (typeof ID_PROPERTY)[TitleType], id: string): string => {
  const query =
    `SELECT ?imdb WHERE { ?item wdt:${property} "${id}" . ` +
    '?item wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt")) }';
  return `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
};

const WikidataAnswer = Schema.Struct({
  results: Schema.optional(
    Schema.Struct({
      bindings: Schema.optional(
        Schema.Array(
          Schema.Struct({
            imdb: Schema.optional(Schema.Struct({ value: Schema.optional(Schema.String) })),
          }),
        ),
      ),
    }),
  ),
});

export class TmdbAmbiguous extends Schema.TaggedError<TmdbAmbiguous>()("TmdbAmbiguous", {
  id: Schema.String,
}) {}

export class TmdbNotFound extends Schema.TaggedError<TmdbNotFound>()("TmdbNotFound", {
  id: Schema.String,
}) {}

export interface ImdbMatch {
  readonly id: string;
  readonly type: TitleType;
}

export interface MappingShape {
  readonly resolve: (
    id: string,
    type?: TitleType,
  ) => Effect.Effect<ImdbMatch, TmdbAmbiguous | TmdbNotFound | HttpError>;
}

const match = (id: string, type: TitleType): ImdbMatch => ({ id, type });

const IMDB_TITLE = /^tt\d{7,8}$/i;

export class Mapping extends Context.Service<Mapping, MappingShape>()("watch/backend/Mapping") {
  static readonly layer: Layer.Layer<Mapping, never, Http> = Layer.effect(
    Mapping,
    Effect.gen(function* () {
      const http = yield* Http;

      const lookup = Effect.fnUntraced(function* (
        property: (typeof ID_PROPERTY)[TitleType],
        id: string,
      ) {
        const answer = yield* http.getJson(wikidataUrl(property, id), WikidataAnswer, {
          "User-Agent": USER_AGENT,
        });
        const imdb = answer.results?.bindings?.[0]?.imdb?.value;
        return imdb !== undefined && IMDB_TITLE.test(imdb) ? imdb : null;
      });

      // A known type asks one property. A bare number could be either kind, so
      // both are tried; a miss is a tagged error because many titles are absent
      // from Wikidata.
      const resolve = Effect.fnUntraced(function* (id: string, type?: TitleType) {
        if (type !== undefined) {
          const found = yield* lookup(ID_PROPERTY[type], id);
          return found === null ? yield* new TmdbNotFound({ id }) : match(found, type);
        }
        const { movie, tv } = yield* Effect.all(
          { movie: lookup(ID_PROPERTY.movie, id), tv: lookup(ID_PROPERTY.tv, id) },
          { concurrency: "unbounded" },
        );
        if (movie !== null && tv !== null) {
          // TMDB movie and TV IDs live in separate spaces and can collide.
          return movie === tv ? match(movie, "movie") : yield* new TmdbAmbiguous({ id });
        }
        if (movie !== null) {
          return match(movie, "movie");
        }
        return tv !== null ? match(tv, "tv") : yield* new TmdbNotFound({ id });
      });

      return Mapping.of({ resolve });
    }),
  );
}
