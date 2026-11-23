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
      assert.deepEqual(meta, { type: "tv", name: "Breaking Bad", year: "2008" });
      assert.deepEqual(asked, [`${CINEMETA}/meta/series/tt0903747.json`]);
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

  it.effect("with no preferred kind the first answer wins and the loser is interrupted", () => {
    let seriesInterrupted = false;
    const getText: HttpShape["getText"] = (url) =>
      url.includes("/meta/series/")
        ? Effect.never.pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                seriesInterrupted = true;
              }),
            ),
          )
        : json(MATRIX);
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0133093");
      assert.strictEqual(meta.type, "movie");
      assert.strictEqual(seriesInterrupted, true);
    }).pipe(Effect.provide(withStub(getText)));
  });

  it.effect("TVMaze answers when both Cinemeta kinds miss", () => {
    const getText = cinemetaMisses({ name: "X", premiered: "2020-05-01", summary: "Y" });
    return Effect.gen(function* () {
      const metadata = yield* Metadata;
      const meta = yield* metadata.resolve("tt0000001");
      assert.deepEqual(meta, { type: "tv", name: "X", year: "2020", description: "Y" });
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
      assert.deepEqual(second, first);
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
