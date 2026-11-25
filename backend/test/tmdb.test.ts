import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { Cache } from "../src/cache";
import { Http, HttpError } from "../src/http";
import type { HttpShape } from "../src/http";
import { Tmdb } from "../src/tmdb";

const withStub = (getText: HttpShape["getText"]) =>
  Tmdb.layer("test-key").pipe(
    Layer.provide(Cache.layer(10)),
    Layer.provide(Http.stubLayer(getText)),
  );

const withSharedCache = (getText: HttpShape["getText"]) => {
  const cache = Cache.layer(10);
  return Layer.mergeAll(
    Tmdb.layer("test-key").pipe(Layer.provide(cache), Layer.provide(Http.stubLayer(getText))),
    cache,
  );
};

const json = (body: unknown) => Effect.succeed(JSON.stringify(body));
const notFound = (url: string) => Effect.fail(new HttpError({ url, status: 404 }));

const route =
  (table: ReadonlyArray<readonly [string, unknown]>): HttpShape["getText"] =>
  (url) => {
    const hit = table.find(([needle]) => url.includes(needle));
    return hit === undefined ? notFound(url) : json(hit[1]);
  };

const PUSHPA = {
  id: 1,
  title: "Pushpa 2",
  original_language: "te",
  release_date: "2024-12-05",
  poster_path: "/pushpa.jpg",
};

describe("Tmdb", () => {
  it.effect("keeps only rows in the chosen language and gives them IMDb ids", () => {
    return Effect.gen(function* () {
      const tmdb = yield* Tmdb;
      const found = yield* tmdb.search({ query: "Pushpa", kind: "movie", language: "te" });
      assert.deepStrictEqual(Option.getOrNull(found), [
        {
          imdbId: "tt1757263",
          name: "Pushpa 2",
          kind: "movie",
          year: "2024",
          poster: "https://image.tmdb.org/t/p/w342/pushpa.jpg",
        },
      ]);
    }).pipe(
      Effect.provide(
        withStub(
          route([
            [
              "/search/movie",
              { results: [PUSHPA, { id: 2, title: "Other", original_language: "en" }] },
            ],
            ["/movie/1/external_ids", { imdb_id: "tt1757263" }],
            ["/movie/2/external_ids", { imdb_id: "tt0000002" }],
          ]),
        ),
      ),
    );
  });

  it.effect("finds a matching row on the second page", () => {
    return Effect.gen(function* () {
      const tmdb = yield* Tmdb;
      const found = yield* tmdb.search({ query: "Pushpa", kind: "movie", language: "te" });
      const values = Option.getOrNull(found);
      assert.deepStrictEqual(
        values?.map((row) => row.imdbId),
        ["tt1757263"],
      );
    }).pipe(
      Effect.provide(
        withStub(
          route([
            ["page=1", { results: [{ id: 9, original_language: "en" }], total_pages: 2 }],
            ["page=2", { results: [PUSHPA], total_pages: 2 }],
            ["/movie/1/external_ids", { imdb_id: "tt1757263" }],
          ]),
        ),
      ),
    );
  });

  it.effect("an upstream failure is None, not an empty list", () => {
    return Effect.gen(function* () {
      const tmdb = yield* Tmdb;
      assert.isTrue(
        Option.isNone(yield* tmdb.search({ query: "Pushpa", kind: "movie", language: "te" })),
      );
    }).pipe(Effect.provide(withStub(notFound)));
  });

  it.effect("names the official services in the region", () => {
    return Effect.gen(function* () {
      const tmdb = yield* Tmdb;
      const official = yield* tmdb.official({ imdbId: "tt1757263", kind: "movie", region: "IN" });
      assert.deepStrictEqual(Option.getOrNull(official), {
        services: ["Netflix", "Aha", "MX Player", "JioHotstar"],
        link: "https://www.themoviedb.org/movie/1/watch",
      });
    }).pipe(
      Effect.provide(
        withStub(
          route([
            ["/find/tt1757263", { movie_results: [{ id: 1 }] }],
            [
              "/movie/1/watch/providers",
              {
                results: {
                  IN: {
                    link: "https://www.themoviedb.org/movie/1/watch",
                    flatrate: [{ provider_name: "Netflix" }, { provider_name: "Aha" }],
                    free: [{ provider_name: "MX Player" }],
                    ads: [{ provider_name: "JioHotstar" }],
                    rent: [{ provider_name: "Apple TV" }],
                  },
                },
              },
            ],
          ]),
        ),
      ),
    );
  });

  it.effect("a title with nothing in the region is a miss", () => {
    return Effect.gen(function* () {
      const tmdb = yield* Tmdb;
      const official = yield* tmdb.official({ imdbId: "tt1757263", kind: "movie", region: "IN" });
      assert.isTrue(Option.isNone(official));
    }).pipe(
      Effect.provide(
        withStub(
          route([
            ["/find/tt1757263", { movie_results: [{ id: 1 }] }],
            ["/movie/1/watch/providers", { results: { US: { link: "https://example.com" } } }],
          ]),
        ),
      ),
    );
  });

  it.effect("a corrupt cached search is a miss, not a crash", () => {
    return Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("tmdb:search:movie:te:pushpa", "{not candidates", 60_000);
      const tmdb = yield* Tmdb;
      const found = yield* tmdb.search({ query: "Pushpa", kind: "movie", language: "te" });
      assert.deepStrictEqual(
        Option.getOrNull(found)?.map((row) => row.imdbId),
        ["tt1757263"],
      );
    }).pipe(
      Effect.provide(
        withSharedCache(
          route([
            ["/search/movie", { results: [PUSHPA] }],
            ["/movie/1/external_ids", { imdb_id: "tt1757263" }],
          ]),
        ),
      ),
    );
  });

  it.effect("a corrupt cached official row is a miss, not a crash", () => {
    return Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("tmdb:official:IN:movie:tt1757263", "{not official", 60_000);
      const tmdb = yield* Tmdb;
      const official = yield* tmdb.official({ imdbId: "tt1757263", kind: "movie", region: "IN" });
      assert.deepStrictEqual(Option.getOrNull(official), {
        services: ["Netflix"],
        link: "https://www.themoviedb.org/movie/1/watch",
      });
    }).pipe(
      Effect.provide(
        withSharedCache(
          route([
            ["/find/tt1757263", { movie_results: [{ id: 1 }] }],
            [
              "/movie/1/watch/providers",
              {
                results: {
                  IN: {
                    link: "https://www.themoviedb.org/movie/1/watch",
                    flatrate: [{ provider_name: "Netflix" }],
                  },
                },
              },
            ],
          ]),
        ),
      ),
    );
  });
});
