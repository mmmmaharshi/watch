import { Context, Effect, Layer, Schema } from "effect";
import { isImdbId } from "../../src/lib/parse-input";
import type { ContentType } from "../../src/lib/types";
import type { HttpError } from "./http";
import { Http } from "./http";
import { askWikidata } from "./wikidata";

// Wikidata stores TMDB movie IDs in P4947 and TMDB TV IDs in P4983.
const ID_PROPERTY = { movie: "P4947", tv: "P4983" } as const;

const mappingQuery = (property: (typeof ID_PROPERTY)[ContentType], id: string): string =>
  `SELECT ?imdb WHERE { ?item wdt:${property} "${id}" . ` +
  '?item wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt")) }';

export class TmdbAmbiguous extends Schema.TaggedError<TmdbAmbiguous>()("TmdbAmbiguous", {
  id: Schema.String,
}) {}

export class TmdbNotFound extends Schema.TaggedError<TmdbNotFound>()("TmdbNotFound", {
  id: Schema.String,
}) {}

export interface ImdbMatch {
  readonly id: string;
  readonly type: ContentType;
}

export interface MappingShape {
  readonly resolve: (
    id: string,
    type?: ContentType,
  ) => Effect.Effect<ImdbMatch, TmdbAmbiguous | TmdbNotFound | HttpError>;
}

const match = (id: string, type: ContentType): ImdbMatch => ({ id, type });

export class Mapping extends Context.Service<Mapping, MappingShape>()("watch/backend/Mapping") {
  static readonly layer: Layer.Layer<Mapping, never, Http> = Layer.effect(
    Mapping,
    Effect.gen(function* () {
      const http = yield* Http;

      const lookup = Effect.fnUntraced(function* (
        property: (typeof ID_PROPERTY)[ContentType],
        id: string,
      ) {
        const answer = yield* askWikidata(http, mappingQuery(property, id), "imdb");
        return answer !== undefined && isImdbId(answer) ? answer : null;
      });

      // A known type asks one property. A bare number could be either kind, so
      // both are tried; a miss is a tagged error because many titles are absent
      // from Wikidata.
      const resolve = Effect.fnUntraced(function* (id: string, type?: ContentType) {
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
