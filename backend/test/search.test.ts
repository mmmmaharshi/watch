import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { LANGUAGE_NEEDS_KEY, SEARCH_FAILED } from "../../src/lib/messages";
import { Cache } from "../src/cache";
import { Http, HttpError } from "../src/http";
import type { HttpShape } from "../src/http";
import { Search } from "../src/search";
import { Tmdb } from "../src/tmdb";

const withStub = (getText: HttpShape["getText"], tmdb: Layer.Layer<Tmdb> = Tmdb.disabledLayer) =>
  Search.layer.pipe(
    Layer.provide(Cache.layer(10)),
    Layer.provide(Http.stubLayer(getText)),
    Layer.provide(tmdb),
  );

const json = (body: unknown) => Effect.succeed(JSON.stringify(body));
const notFound = (url: string) => Effect.fail(new HttpError({ url, status: 404 }));

const movieCatalog = {
  metas: [
    { imdb_id: "tt0273148", type: "movie", name: "The Officer's Ward", releaseInfo: "2001" },
    { imdb_id: "tt0133093", type: "movie", name: "The Matrix", releaseInfo: "1999" },
  ],
};

const tvmaze = [
  {
    score: 1.18,
    show: {
      name: "The Office",
      premiered: "2005-03-24",
      externals: { imdb: "tt0386676" },
    },
  },
];

describe("Search", () => {
  it.effect("a movie search reads only the movie catalog and sorts newest first", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return url.includes("catalog/movie") ? json(movieCatalog) : notFound(url);
    };
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Matrix", kind: "movie", language: "" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [
          { imdbId: "tt0273148", name: "The Officer's Ward", year: "2001", kind: "movie" },
          { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" },
        ],
      });
      assert.isTrue(asked.every((url) => !url.includes("series")));
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a TV search falls back to TVMaze when the series catalog is empty", () => {
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Office", kind: "tv", language: "" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [{ imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" }],
      });
    }).pipe(
      Effect.provide(
        withStub((url) =>
          url.includes("catalog/series")
            ? json({ metas: [] })
            : url.includes("tvmaze")
              ? json(tvmaze)
              : notFound(url),
        ),
      ),
    );
  });

  it.effect("reports a failure when every source fails", () => {
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Office", kind: "tv", language: "" });
      assert.deepStrictEqual(outcome, { ok: false, error: SEARCH_FAILED });
    }).pipe(Effect.provide(withStub(notFound)));
  });

  it.effect("a language without a TMDB key says so", () => {
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "Pushpa", kind: "movie", language: "te" });
      assert.deepStrictEqual(outcome, { ok: false, error: LANGUAGE_NEEDS_KEY });
    }).pipe(Effect.provide(withStub(notFound)));
  });

  it.effect("a language search sorts the TMDB rows with the same rule", () => {
    const tmdb = Layer.succeed(
      Tmdb,
      Tmdb.of({
        configured: true,
        search: () =>
          Effect.succeed(
            Option.some([
              { imdbId: "tt1", name: "Older", year: "2001", kind: "movie" as const },
              { imdbId: "tt2", name: "Newer", year: "2024", kind: "movie" as const },
            ]),
          ),
        official: () => Effect.succeed(Option.none()),
      }),
    );
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "Pushpa", kind: "movie", language: "te" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [
          { imdbId: "tt2", name: "Newer", year: "2024", kind: "movie" },
          { imdbId: "tt1", name: "Older", year: "2001", kind: "movie" },
        ],
      });
    }).pipe(Effect.provide(withStub(notFound, tmdb)));
  });

  it.effect("answers a repeated query from the cache", () => {
    let calls = 0;
    return Effect.gen(function* () {
      const search = yield* Search;
      yield* search.search({ query: "The Matrix", kind: "movie", language: "" });
      yield* search.search({ query: "  the matrix ", kind: "movie", language: "" });
      assert.strictEqual(calls, 1);
    }).pipe(
      Effect.provide(
        withStub((url) => {
          calls += 1;
          return json(movieCatalog);
        }),
      ),
    );
  });
});
