import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SEARCH_FAILED } from "../../src/lib/messages";
import { Cache } from "../src/cache";
import { Http, HttpError } from "../src/http";
import type { HttpShape } from "../src/http";
import { Search } from "../src/search";

const withStub = (getText: HttpShape["getText"]) =>
  Search.layer.pipe(Layer.provide(Cache.layer(10)), Layer.provide(Http.stubLayer(getText)));

const withSharedCache = (getText: HttpShape["getText"]) => {
  const cache = Cache.layer(10);
  return Layer.mergeAll(
    Search.layer.pipe(Layer.provide(cache), Layer.provide(Http.stubLayer(getText))),
    cache,
  );
};

const json = (body: unknown) => Effect.succeed(JSON.stringify(body));
const notFound = (url: string) => Effect.fail(new HttpError({ url, status: 404 }));

const movieCatalog = {
  metas: [
    { imdb_id: "tt0273148", type: "movie", name: "The Officer's Ward", releaseInfo: "2001" },
    { imdb_id: "tt0133093", type: "movie", name: "The Matrix", releaseInfo: "1999" },
  ],
};

const seriesCatalog = {
  metas: [{ imdb_id: "tt0903747", type: "series", name: "Breaking Bad", releaseInfo: "2008" }],
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

const bothCatalogs = (url: string) =>
  url.includes("catalog/movie")
    ? json(movieCatalog)
    : url.includes("catalog/series")
      ? json(seriesCatalog)
      : notFound(url);

describe("Search", () => {
  it.effect("a title search reads both catalogs and puts the exact title first", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return bothCatalogs(url);
    };
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Matrix" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [
          { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" },
          { imdbId: "tt0903747", name: "Breaking Bad", year: "2008", kind: "tv" },
          { imdbId: "tt0273148", name: "The Officer's Ward", year: "2001", kind: "movie" },
        ],
      });
      assert.isTrue(asked.some((url) => url.includes("catalog/movie")));
      assert.isTrue(asked.some((url) => url.includes("catalog/series")));
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("falls back to TVMaze when the series catalog is empty", () => {
    return Effect.gen(function* () {
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Office" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [{ imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" }],
      });
    }).pipe(
      Effect.provide(
        withStub((url) =>
          url.includes("catalog/movie")
            ? json({ metas: [] })
            : url.includes("catalog/series")
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
      const outcome = yield* search.search({ query: "The Office" });
      assert.deepStrictEqual(outcome, { ok: false, error: SEARCH_FAILED });
    }).pipe(Effect.provide(withStub(notFound)));
  });

  it.effect("answers a repeated query from the cache", () => {
    let calls = 0;
    return Effect.gen(function* () {
      const search = yield* Search;
      yield* search.search({ query: "The Matrix" });
      yield* search.search({ query: "  the matrix " });
      assert.strictEqual(calls, 2);
    }).pipe(
      Effect.provide(
        withStub((url) => {
          calls += 1;
          return bothCatalogs(url);
        }),
      ),
    );
  });

  it.effect("a corrupt cached answer is a miss, not a crash", () => {
    let calls = 0;
    return Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("search:the matrix", "{not a candidate list", 60_000);
      const search = yield* Search;
      const outcome = yield* search.search({ query: "The Matrix" });
      assert.deepStrictEqual(outcome, {
        ok: true,
        candidates: [
          { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" },
          { imdbId: "tt0903747", name: "Breaking Bad", year: "2008", kind: "tv" },
          { imdbId: "tt0273148", name: "The Officer's Ward", year: "2001", kind: "movie" },
        ],
      });
      assert.strictEqual(calls, 2);
    }).pipe(
      Effect.provide(
        withSharedCache((url) => {
          calls += 1;
          return bothCatalogs(url);
        }),
      ),
    );
  });
});
