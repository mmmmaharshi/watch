import { assert, describe, it } from "@effect/vitest";
import { assertNone, assertSome } from "@effect/vitest/utils";
import { Effect } from "effect";
import { Cache } from "../src/cache";
import { cacheLayer, providerListLayer, siteFor } from "../src/compose";
import type { KvNamespace } from "../src/kv";
import { ProviderList } from "../src/provider-list";
import { PROVIDER_LIST_KEY } from "../../src/lib/providers";

const stubKv = (initial: Record<string, string> = {}) => {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    put: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
  } satisfies KvNamespace & { readonly values: Map<string, string> };
};

describe("the edge composition", () => {
  it.effect("without a KV binding the cache stays in memory", () =>
    Effect.gen(function* () {
      const cache = yield* Cache;
      yield* cache.set("key", "value", 60_000);

      assertSome(yield* cache.get("key"), "value");
    }).pipe(Effect.provide(cacheLayer({}))),
  );

  it.effect("a KV binding backs the cache", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      const cache = yield* Cache.pipe(Effect.provide(cacheLayer({ CACHE: kv })));
      yield* cache.set("key", "value", 60_000);

      assert.strictEqual(kv.values.get("key"), "value");
      assertSome(yield* cache.get("key"), "value");
    }),
  );

  it.effect("without a provider-list binding every load misses", () =>
    Effect.gen(function* () {
      const list = yield* ProviderList;
      assertNone(yield* list.load);
    }).pipe(Effect.provide(providerListLayer({}))),
  );

  it.effect("a provider-list binding serves the stored list", () => {
    const stored = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      providers: [{ name: "a.test", baseUrl: "https://a.test" }],
    };
    return Effect.gen(function* () {
      const list = yield* ProviderList;
      assertSome(yield* list.load, stored);
    }).pipe(
      Effect.provide(
        providerListLayer({
          PROVIDERS: stubKv({ [PROVIDER_LIST_KEY]: JSON.stringify(stored) }),
        }),
      ),
    );
  });

  it("siteFor keeps one in-memory site and builds one per binding", () => {
    assert.strictEqual(siteFor(), siteFor());
    assert.notStrictEqual(siteFor({ CACHE: stubKv() }), siteFor());
  });
});
