import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { Handler } from "../src/handler";
import { COPY } from "../../src/lib/copy";
import type { LookupInput } from "../../src/lib/types";
import { Mapping, TmdbAmbiguous, TmdbNotFound } from "../src/mapping";
import type { MappingShape } from "../src/mapping";
import { Metadata, MetadataMissing } from "../src/metadata";
import type { MetadataShape } from "../src/metadata";
import { Providers } from "../src/providers";
import type { ProvidersShape } from "../src/providers";

interface HandlerStubs {
  readonly mapping?: MappingShape["resolve"];
  readonly metadata?: MetadataShape["resolve"];
  readonly providers?: ProvidersShape["selectStream"];
}

const unexpected = (step: string) => Effect.die(new Error(`unexpected ${step} call`));

const stub = (stubs: HandlerStubs = {}) =>
  Handler.layer.pipe(
    Layer.provide(
      Layer.succeed(Mapping, { resolve: stubs.mapping ?? (() => unexpected("mapping")) }),
    ),
    Layer.provide(
      Layer.succeed(Metadata, { resolve: stubs.metadata ?? (() => unexpected("metadata")) }),
    ),
    Layer.provide(
      Layer.succeed(Providers, {
        selectStream: stubs.providers ?? (() => unexpected("providers")),
      }),
    ),
  );

const handle = (input: LookupInput, stubs: HandlerStubs = {}) =>
  Effect.gen(function* () {
    const handler = yield* Handler;
    return yield* handler.handle(input);
  }).pipe(Effect.provide(stub(stubs)));

describe("Handler", () => {
  it.effect("an unparseable id is invalid input", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* handle({ id: "not a title" }), {
        ok: false,
        status: 400,
        reason: "invalid_input",
        error: COPY.outcome.invalidInput,
      });
    }),
  );

  it.effect("an ambiguous TMDB number is a 400", () =>
    Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "603" },
        { mapping: () => Effect.fail(new TmdbAmbiguous({ id: "603" })) },
      );

      assert.deepStrictEqual(outcome, {
        ok: false,
        status: 400,
        reason: "tmdb_ambiguous",
        error: "TMDB ID is ambiguous. Use a movie or TV link.",
      });
    }),
  );

  it.effect("a TMDB number with no IMDb match is a 502", () =>
    Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "999999" },
        { mapping: () => Effect.fail(new TmdbNotFound({ id: "999999" })) },
      );

      assert.deepStrictEqual(outcome, {
        ok: false,
        status: 502,
        reason: "tmdb_not_found",
        error: "TMDB ID not found",
      });
    }),
  );

  it.effect("missing metadata is a 502", () =>
    Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "tt0133093" },
        { metadata: () => Effect.fail(new MetadataMissing({ id: "tt0133093" })) },
      );

      assert.deepStrictEqual(outcome, {
        ok: false,
        status: 502,
        reason: "metadata_missing",
        error: COPY.outcome.metadataMissing,
      });
    }),
  );

  it.effect("no working provider is a 503", () =>
    Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "tt0133093" },
        {
          metadata: () => Effect.succeed({ type: "movie", name: "The Matrix" }),
          providers: () => Effect.succeed(Option.none()),
        },
      );

      assert.deepStrictEqual(outcome, {
        ok: false,
        status: 503,
        reason: "no_providers",
        error: COPY.outcome.noProviders,
      });
    }),
  );

  it.effect("a strict pick passes the kind to metadata", () => {
    const calls: Array<{
      id: string;
      preferred?: "movie" | "tv" | undefined;
      strict?: boolean | undefined;
    }> = [];
    return Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "tt0903747", kind: "tv", strictKind: true },
        {
          metadata: (id, preferred, strict) => {
            calls.push({ id, preferred, strict });
            return Effect.fail(new MetadataMissing({ id }));
          },
        },
      );

      assert.deepStrictEqual(calls, [{ id: "tt0903747", preferred: "tv", strict: true }]);
      assert.deepStrictEqual(outcome, {
        ok: false,
        status: 502,
        reason: "metadata_missing",
        error: COPY.outcome.metadataMissing,
      });
    });
  });

  it.effect("a picked name covers a metadata miss", () => {
    return Effect.gen(function* () {
      const outcome = yield* handle(
        {
          id: "tt15219412",
          kind: "tv",
          strictKind: true,
          name: "The Matrixx and Rhodes Show",
          year: "2018",
        },
        {
          metadata: (id) => Effect.fail(new MetadataMissing({ id })),
          providers: () =>
            Effect.succeed(
              Option.some({
                url: "https://a.test/embed/tv/tt15219412",
                provider: "a.test",
              }),
            ),
        },
      );

      assert.deepStrictEqual(outcome, {
        ok: true,
        result: {
          id: "tt15219412",
          url: "https://a.test/embed/tv/tt15219412",
          provider: "a.test",
          type: "tv",
          name: "The Matrixx and Rhodes Show",
          year: "2018",
        },
      });
    });
  });

  it.effect("a resolved title returns the stream and its metadata", () => {
    const mappingCalls: Array<{ id: string; type?: "movie" | "tv" }> = [];
    const providerCalls: Array<{ type: string; id: string; exclude?: string }> = [];
    return Effect.gen(function* () {
      const outcome = yield* handle(
        { id: "1396", kind: "tv", exclude: "b.test" },
        {
          mapping: (id, type) => {
            mappingCalls.push(type === undefined ? { id } : { id, type });
            return Effect.succeed({ id: "tt0903747", type: "tv" });
          },
          metadata: () =>
            Effect.succeed({
              type: "tv",
              name: "Breaking Bad",
              year: "2008",
              rating: "9.5",
              description: "A chemistry teacher turns to crime.",
            }),
          providers: (args) => {
            providerCalls.push(args);
            return Effect.succeed(
              Option.some({
                url: "https://a.test/embed/tv/tt0903747",
                provider: "a.test",
              }),
            );
          },
        },
      );

      assert.deepStrictEqual(outcome, {
        ok: true,
        result: {
          id: "tt0903747",
          url: "https://a.test/embed/tv/tt0903747",
          provider: "a.test",
          type: "tv",
          name: "Breaking Bad",
          year: "2008",
          rating: "9.5",
          description: "A chemistry teacher turns to crime.",
        },
      });
      assert.deepStrictEqual(mappingCalls, [{ id: "1396", type: "tv" }]);
      assert.deepStrictEqual(providerCalls, [{ type: "tv", id: "tt0903747", exclude: "b.test" }]);
    });
  });
});
