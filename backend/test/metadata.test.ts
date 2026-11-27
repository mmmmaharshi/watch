import { assert, describe, it } from "@effect/vitest";
import { assertInstanceOf } from "@effect/vitest/utils";
import { Effect, Layer } from "effect";
import { Cache } from "../src/cache";
import { Http, HttpError } from "../src/http";
import type { HttpShape } from "../src/http";
import { Metadata, MetadataMissing } from "../src/metadata";

const CINEMETA = "https://v3-cinemeta.strem.io";

const MATRIX = {
  meta: { name: "The Matrix", year: "1999", imdbRating: "8.7", description: "Neo." },
};

const withStub = (getText: HttpShape["getText"]) =>
  Metadata.layer.pipe(Layer.provide(Cache.layer(10)), Layer.provide(Http.stubLayer(getText)));

const json = (body: unknown) => Effect.succeed(JSON.stringify(body));
const notFound = (url: string) => Effect.fail(new HttpError({ url, status: 404 }));
const transient = (url: string) => Effect.fail(new HttpError({ url }));

// Cinemeta misses on both kinds; TVMaze answers with the given show.
const cinemetaMisses =
  (show: unknown): HttpShape["getText"] =>
  (url) =>
    url.includes("cinemeta") ? notFound(url) : json(show);

const strictCacheText: HttpShape["getText"] = (url) => {
  if (url.includes("/meta/movie/")) {
    return json(MATRIX);
  }
  if (url.includes("/meta/series/")) {
    return notFound(url);
  }
  return json({ name: "The Approval Matrix", premiered: "2014-01-01" });
};

// Cinemeta answers tt2661044 twice: a "Yellowknife" movie stub with no year,
// and the series record holding The 100's episodes.
const stubMovieText: HttpShape["getText"] = (url) =>
  url.includes("/meta/series/")
    ? json({
        meta: {
          name: "The 100",
          year: "2014–2020",
          imdbRating: "7.5",
          videos: [{ id: "tt2473624" }, { id: "tt2473626" }],
        },
      })
    : json({ meta: { name: "Yellowknife", year: "", releaseInfo: "2002", imdbRating: "7.5" } });

const namedSeriesText: HttpShape["getText"] = (url) =>
  url.includes("/meta/series/")
    ? json({ meta: { name: "Some Show", year: "2020" } })
    : json(MATRIX);

// Both kinds look real: a series with episodes and a movie carrying a year.
// Wikidata's answer is the P31 root the stub returns.
const bothLookReal =
  (root: string): HttpShape["getText"] =>
  (url) => {
    if (url.includes("wikidata")) {
      return json({
        results: { bindings: [{ root: { value: `http://www.wikidata.org/entity/${root}` } }] },
      });
    }
    return url.includes("/meta/series/")
      ? json({ meta: { name: "The 100", year: "2014–2020", videos: [{ id: "tt1" }] } })
      : json({ meta: { name: "Yellowknife", year: "2002", imdbRating: "7.5" } });
  };

const brokenWikiText: HttpShape["getText"] = (url) =>
  url.includes("wikidata") ? notFound(url) : bothLookReal("Q5398426")(url);

describe("Metadata", () => {
  it.effect("a preferred kind answers without asking the other kind", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return json({ meta: { name: "Breaking Bad", year: "2008" } });
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0903747", "tv");
      assert.deepStrictEqual(meta, { type: "tv", name: "Breaking Bad", year: "2008" });
      assert.deepStrictEqual(asked, [`${CINEMETA}/meta/series/tt0903747.json`]);
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a preferred kind asks the other kind when the first misses", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return url.includes("/meta/series/") ? notFound(url) : json(MATRIX);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0133093", "tv");
      assert.strictEqual(meta.type, "movie");
      assert.strictEqual(meta.name, "The Matrix");
      assert.strictEqual(meta.rating, "8.7");
      assert.strictEqual(asked.length, 2);
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a strict TV pick asks TVMaze before the movie catalog", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      if (url.includes("/meta/series/")) {
        return notFound(url);
      }
      if (url.includes("/meta/movie/")) {
        return json({ meta: { name: "After Work", year: "2015" } });
      }
      return json({ name: "The Approval Matrix", premiered: "2014-01-01" });
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt3959436", "tv", true);
      assert.deepStrictEqual(meta, { type: "tv", name: "The Approval Matrix", year: "2014" });
      assert.isFalse(asked.some((url) => url.includes("/meta/movie/")));
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a strict kind keeps the requested type when the other catalog has the name", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return url.includes("/meta/movie/") ? json(MATRIX) : notFound(url);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0133093", "tv", true);
      assert.strictEqual(meta.type, "tv");
      assert.strictEqual(meta.name, "The Matrix");
      assert.strictEqual(meta.rating, "8.7");
      assert.isTrue(asked.some((url) => url.includes("/meta/movie/")));
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a strict kind does not read the auto cache", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const auto = yield* metadata.resolve("tt0133093");
      assert.strictEqual(auto.type, "movie");
      const strict = yield* metadata.resolve("tt0133093", "tv", true);
      assert.strictEqual(strict.type, "tv");
      assert.strictEqual(strict.name, "The Approval Matrix");
    }).pipe(Effect.provide(withStub(strictCacheText)));
  });

  it.effect("a series that lists episodes wins over a stub movie record", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt2661044");
      assert.deepStrictEqual(meta, { type: "tv", name: "The 100", year: "2014", rating: "7.5" });
    }).pipe(Effect.provide(withStub(stubMovieText)));
  });

  it.effect("a movie with its own year beats a series record that lists no episodes", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0133093");
      assert.strictEqual(meta.type, "movie");
      assert.strictEqual(meta.name, "The Matrix");
    }).pipe(Effect.provide(withStub(namedSeriesText)));
  });

  it.effect("when both kinds look real, Wikidata picks the movie", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt2661044");
      assert.strictEqual(meta.type, "movie");
      assert.strictEqual(meta.name, "Yellowknife");
    }).pipe(Effect.provide(withStub(bothLookReal("Q11424"))));
  });

  it.effect("when both kinds look real, Wikidata picks the series", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt2661044");
      assert.strictEqual(meta.type, "tv");
      assert.strictEqual(meta.name, "The 100");
    }).pipe(Effect.provide(withStub(bothLookReal("Q5398426"))));
  });

  it.effect("a Wikidata failure keeps the Cinemeta answer", () => {
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt2661044");
      assert.strictEqual(meta.type, "tv");
      assert.strictEqual(meta.name, "The 100");
    }).pipe(Effect.provide(withStub(brokenWikiText)));
  });

  it.effect("an answer that proves itself asks no third party", () => {
    const asked: Array<string> = [];
    const getText: HttpShape["getText"] = (url) => {
      asked.push(url);
      return stubMovieText(url);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt2661044");
      assert.strictEqual(meta.name, "The 100");
      assert.isFalse(asked.some((url) => url.includes("wikidata")));
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("TVMaze answers when both Cinemeta kinds miss", () => {
    const getText = cinemetaMisses({ name: "X", premiered: "2020-05-01", summary: "Y" });
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0000001");
      assert.deepStrictEqual(meta, { type: "tv", name: "X", year: "2020", description: "Y" });
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("HTML is stripped from a TVMaze summary", () => {
    const getText = cinemetaMisses({
      name: "X",
      premiered: "2020-05-01",
      summary: "<p>Neo <b>lives</b>.</p>",
    });
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0000001");
      assert.strictEqual(meta.description, "Neo lives.");
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a resolved title is cached", () => {
    let cinemetaCalls = 0;
    const getText: HttpShape["getText"] = (url) => {
      if (url.startsWith(CINEMETA)) {
        cinemetaCalls++;
      }
      return json(MATRIX);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const first = yield* metadata.resolve("tt0133093");
      const second = yield* metadata.resolve("tt0133093");
      assert.deepStrictEqual(second, first);
      // One call per kind on the first resolve, none on the cached one.
      assert.strictEqual(cinemetaCalls, 2);
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a verified miss is cached", () => {
    let cinemetaCalls = 0;
    const getText: HttpShape["getText"] = (url) => {
      if (url.includes("cinemeta")) {
        cinemetaCalls++;
      }
      return notFound(url);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const first = yield* metadata.resolve("tt9999999").pipe(Effect.flip);
      const second = yield* metadata.resolve("tt9999999").pipe(Effect.flip);
      assertInstanceOf(first, MetadataMissing);
      assertInstanceOf(second, MetadataMissing);
      // One call per kind on the first resolve, none on the cached one.
      assert.strictEqual(cinemetaCalls, 2);
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("a transient failure is not cached", () => {
    let cinemetaCalls = 0;
    const getText: HttpShape["getText"] = (url) => {
      if (url.startsWith(CINEMETA)) {
        cinemetaCalls++;
        return transient(url);
      }
      return notFound(url);
    };
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const first = yield* metadata.resolve("tt9999999").pipe(Effect.flip);
      const second = yield* metadata.resolve("tt9999999").pipe(Effect.flip);
      assertInstanceOf(first, MetadataMissing);
      assertInstanceOf(second, MetadataMissing);
      // Both resolves hit Cinemeta because the miss was not cached.
      assert.strictEqual(cinemetaCalls, 4);
    }).pipe(Effect.provide(withStub(getText)));
  });
});
