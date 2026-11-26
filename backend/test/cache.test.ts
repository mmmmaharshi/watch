import { assert, describe, it } from "@effect/vitest";
import { assertNone, assertSome } from "@effect/vitest/utils";
import { Effect, Option, Schema } from "effect";
import { TestClock } from "effect/testing";
import { Cache } from "../src/cache";

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

describe("Cache", () => {
  it.effect.prop("reads follow the TTL boundary", [Milliseconds, Milliseconds], ([ttl, elapsed]) =>
    Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("key", "value", ttl);
      yield* TestClock.adjust(elapsed);
      assert.strictEqual(Option.isSome(yield* cache.get("key")), elapsed < ttl);
    }).pipe(Effect.provide(Cache.layer(10))),
  );

  it.effect.prop(
    "a full cache keeps the newest keys and drops the oldest",
    [Schema.Literals([1, 2, 3, 4]), Schema.Array(Schema.String)],
    ([maxEntries, keys]) =>
      Effect.gen(function* () {
        const cache = yield* Cache;
        const distinct = [...new Set(keys)];
        for (const [index, key] of distinct.entries()) {
          yield* cache.set(key, String(index), 60_000);
        }
        const kept = new Set(distinct.slice(-maxEntries));
        for (const key of distinct) {
          assert.strictEqual(
            Option.isSome(yield* cache.get(key)),
            kept.has(key),
            `key ${JSON.stringify(key)} in a cache of ${maxEntries}`,
          );
        }
      }).pipe(Effect.provide(Cache.layer(maxEntries))),
  );

  it.effect("a read keeps an entry from eviction", () =>
    Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("old", "1", 60_000);
      yield* cache.set("new", "2", 60_000);
      assertSome(yield* cache.get("old"), "1");
      yield* cache.set("newer", "3", 60_000);
      assertSome(yield* cache.get("old"), "1");
      assertNone(yield* cache.get("new"));
    }).pipe(Effect.provide(Cache.layer(2))),
  );
});
