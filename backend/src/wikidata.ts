import { Effect, Schema } from "effect";
import { USER_AGENT, WIKIDATA_HOST } from "../../src/consts";
import type { HttpError, HttpShape } from "./http";

// The app sends two queries: the TMDB-to-IMDb mapping selects `imdb`, the type
// check selects `root`. One schema decodes either row.
const SparqlAnswer = Schema.Struct({
  results: Schema.optional(
    Schema.Struct({
      bindings: Schema.optional(
        Schema.Array(
          Schema.Struct({
            imdb: Schema.optional(Schema.Struct({ value: Schema.optional(Schema.String) })),
            root: Schema.optional(Schema.Struct({ value: Schema.optional(Schema.String) })),
          }),
        ),
      ),
    }),
  ),
});

const sparqlUrl = (query: string): string =>
  `${WIKIDATA_HOST}/sparql?query=${encodeURIComponent(query)}&format=json`;

// One request, one SELECT variable: the first binding holds the answer. A
// descriptive User-Agent is required by the query service's usage policy.
export const askWikidata = (
  http: HttpShape,
  query: string,
  variable: "imdb" | "root",
): Effect.Effect<string | undefined, HttpError> =>
  http
    .getJson(sparqlUrl(query), SparqlAnswer, { "User-Agent": USER_AGENT })
    .pipe(Effect.map((answer) => answer.results?.bindings?.[0]?.[variable]?.value));
