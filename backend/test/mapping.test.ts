import { assert, describe, it } from "@effect/vitest";
import { assertInstanceOf } from "@effect/vitest/utils";
import { Effect, Layer } from "effect";
import { USER_AGENT } from "../../src/consts";
import { Http, HttpError } from "../src/http";
import { Mapping, TmdbAmbiguous, TmdbNotFound } from "../src/mapping";

type Property = "movie" | "tv";

interface Answers {
  readonly movie?: string | null;
  readonly tv?: string | null;
}

interface Seen {
  readonly url: string;
  readonly headers: Record<string, string> | undefined;
}

const propertyIn = (url: string): Property =>
  decodeURIComponent(url).includes("wdt:P4947") ? "movie" : "tv";

const stub = (answers: Answers, seen: Array<Seen> = []) =>
  Http.stubLayer((url, headers) => {
    seen.push({ url, headers });
    const imdb = answers[propertyIn(url)];
    return Effect.succeed(
      JSON.stringify({
        results: {
          bindings: imdb === undefined || imdb === null ? [] : [{ imdb: { value: imdb } }],
        },
      }),
    );
  });

const provided = (http: Layer.Layer<Http>) =>
  Effect.provide(Mapping.layer.pipe(Layer.provide(http)));

describe("Mapping", () => {
  it.effect("a movie id resolves through P4947", () => {
    const seen: Array<Seen> = [];
    return Effect.gen(function* () {
      const mapping = yield* Mapping;
      const found = yield* mapping.resolve("300523", "movie");
      assert.deepStrictEqual(found, { id: "tt0133093", type: "movie" });
      assert.strictEqual(seen.length, 1);
      assert.ok(decodeURIComponent(seen[0]?.url ?? "").includes('wdt:P4947 "300523"'));
    }).pipe(provided(stub({ movie: "tt0133093" }, seen)));
  });

  it.effect("a TV id resolves through P4983", () => {
    const seen: Array<Seen> = [];
    return Effect.gen(function* () {
      const mapping = yield* Mapping;
      const found = yield* mapping.resolve("1396", "tv");
      assert.deepStrictEqual(found, { id: "tt0903747", type: "tv" });
      assert.deepStrictEqual(
        seen.map(({ url }) => propertyIn(url)),
        ["tv"],
      );
    }).pipe(provided(stub({ tv: "tt0903747" }, seen)));
  });

  it.effect("a bare id that only a movie matches resolves as a movie", () => {
    const seen: Array<Seen> = [];
    return Effect.gen(function* () {
      const mapping = yield* Mapping;
      const found = yield* mapping.resolve("300523");
      assert.deepStrictEqual(found, { id: "tt0133093", type: "movie" });
      assert.deepStrictEqual(seen.map(({ url }) => propertyIn(url)).sort(), ["movie", "tv"]);
    }).pipe(provided(stub({ movie: "tt0133093" }, seen)));
  });

  it.effect("a bare id that only a show matches resolves as a show", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const found = yield* mapping.resolve("1396");
      assert.deepStrictEqual(found, { id: "tt0903747", type: "tv" });
    }).pipe(provided(stub({ tv: "tt0903747" }))),
  );

  it.effect("a bare id that both kinds answer differently is ambiguous", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const error = yield* mapping.resolve("1396").pipe(Effect.flip);
      assertInstanceOf(error, TmdbAmbiguous);
      assert.strictEqual(error.id, "1396");
    }).pipe(provided(stub({ movie: "tt0133093", tv: "tt0903747" }))),
  );

  it.effect("a bare id that both kinds answer the same resolves as a movie", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const found = yield* mapping.resolve("1396");
      assert.deepStrictEqual(found, { id: "tt0133093", type: "movie" });
    }).pipe(provided(stub({ movie: "tt0133093", tv: "tt0133093" }))),
  );

  it.effect("a bare id that neither kind matches is not found", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const error = yield* mapping.resolve("999999").pipe(Effect.flip);
      assertInstanceOf(error, TmdbNotFound);
      assert.strictEqual(error.id, "999999");
    }).pipe(provided(stub({}))),
  );

  it.effect("a known type that the upstream does not match is not found", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const error = yield* mapping.resolve("999999", "movie").pipe(Effect.flip);
      assertInstanceOf(error, TmdbNotFound);
    }).pipe(provided(stub({}))),
  );

  it.effect("a binding without an IMDb title id is not found", () =>
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const error = yield* mapping.resolve("300523", "movie").pipe(Effect.flip);
      assertInstanceOf(error, TmdbNotFound);
    }).pipe(provided(stub({ movie: "nm0000206" }))),
  );

  it.effect("each lookup identifies the app to Wikidata", () => {
    const seen: Array<Seen> = [];
    return Effect.gen(function* () {
      const mapping = yield* Mapping;
      yield* mapping.resolve("1396");
      assert.deepStrictEqual(
        seen.map(({ headers }) => headers),
        [{ "User-Agent": USER_AGENT }, { "User-Agent": USER_AGENT }],
      );
    }).pipe(provided(stub({ tv: "tt0903747" }, seen)));
  });

  it.effect("a transport failure surfaces as the Http error", () => {
    const error = new HttpError({ url: "https://query.wikidata.org/sparql", status: 403 });
    return Effect.gen(function* () {
      const mapping = yield* Mapping;
      const failure = yield* mapping.resolve("300523", "movie").pipe(Effect.flip);
      assertInstanceOf(failure, HttpError);
      assert.strictEqual(failure.status, 403);
    }).pipe(provided(Http.stubLayer(() => Effect.fail(error))));
  });
});
