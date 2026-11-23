import { assert, describe, it } from "@effect/vitest";
import { assertNone, assertSome } from "@effect/vitest/utils";
import { Effect } from "effect";
import { Cache } from "../src/cache";
import type { KvNamespace } from "../src/kv";

interface StubKv extends KvNamespace {
  readonly values: Map<string, string>;
  readonly ttls: Array<number | undefined>;
}

const stubKv = (overrides: Partial<KvNamespace> = {}): StubKv => {
  const values = new Map<string, string>();
  const ttls: Array<number | undefined> = [];
  return {
    values,
    ttls,
    get: (key) => Promise.resolve(values.get(key) ?? null),
    put: (key, value, options) => {
      ttls.push(options?.expirationTtl);
      values.set(key, value);
      return Promise.resolve();
    },
    ...overrides,
  };
};

describe("Cache over KV", () => {
  it.effect("a written value reads back from the namespace", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      const cache = yield* Cache.pipe(Effect.provide(Cache.layerKv(kv)));
      yield* cache.set("key", "value", 60_000);

      assert.strictEqual(kv.values.get("key"), "value");
      assertSome(yield* cache.get("key"), "value");
    }),
  );

  it.effect("an absent key reads as missing", () =>
    Effect.gen(function* () {
      const cache = yield* Cache.pipe(Effect.provide(Cache.layerKv(stubKv())));
      assertNone(yield* cache.get("key"));
    }),
  );

  it.effect("a TTL goes to KV in whole seconds, never under the 60s floor", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      const cache = yield* Cache.pipe(Effect.provide(Cache.layerKv(kv)));

      yield* cache.set("milliseconds", "1", 1000);
      yield* cache.set("almost-minute", "2", 59_999);
      yield* cache.set("exact-minute", "3", 60_000);
      yield* cache.set("minutes", "4", 90_001);

      // KV refuses an expiry under 60 seconds, so short TTLs round up to it.
      assert.deepStrictEqual(kv.ttls, [60, 60, 60, 91]);
    }),
  );

  it.effect("a failing KV read reads as a miss", () =>
    Effect.gen(function* () {
      const cache = yield* Cache.pipe(
        Effect.provide(Cache.layerKv(stubKv({ get: () => Promise.reject(new Error("down")) }))),
      );

      assertNone(yield* cache.get("key"));
    }),
  );

  it.effect("a failing KV write does not fail the caller", () =>
    Effect.gen(function* () {
      const cache = yield* Cache.pipe(
        Effect.provide(Cache.layerKv(stubKv({ put: () => Promise.reject(new Error("down")) }))),
      );

      yield* cache.set("key", "value", 60_000);
    }),
  );
});
