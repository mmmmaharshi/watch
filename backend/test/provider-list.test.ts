import { assert, describe, it } from "@effect/vitest";
import { assertNone, assertSome } from "@effect/vitest/utils";
import { Effect } from "effect";
import type { KvNamespace } from "../src/kv";
import { ProviderList } from "../src/provider-list";
import { PROVIDER_LIST_KEY } from "../src/providers";
import type { ProvidersFile } from "../src/providers";

interface StubKv extends KvNamespace {
  readonly values: Map<string, string>;
}

const stubKv = (): StubKv => {
  const values = new Map<string, string>();
  return {
    values,
    get: (key) => Promise.resolve(values.get(key) ?? null),
    put: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
};

const FILE: ProvidersFile = {
  updatedAt: "2026-11-21T00:00:00.000Z",
  providers: [
    { name: "vidsrc.sh", baseUrl: "https://vidsrc.sh" },
    { name: "vidfast.vc", baseUrl: "https://vidfast.vc" },
  ],
};

const list = (kv: KvNamespace) =>
  Effect.gen(function* () {
    return yield* ProviderList;
  }).pipe(Effect.provide(ProviderList.layerKv(kv)));

describe("ProviderList over KV", () => {
  it.effect("a saved list reads back unchanged from one key", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      const providerList = yield* list(kv);

      yield* providerList.save(FILE);
      const loaded = yield* providerList.load;

      assertSome(loaded, FILE);
      assert.deepStrictEqual([...kv.values.keys()], [PROVIDER_LIST_KEY]);
    }),
  );

  it.effect("an absent key reads as no list", () =>
    Effect.gen(function* () {
      const providerList = yield* list(stubKv());
      assertNone(yield* providerList.load);
    }),
  );

  it.effect("a value that is not JSON reads as no list", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      kv.values.set(PROVIDER_LIST_KEY, "not json");
      const providerList = yield* list(kv);

      assertNone(yield* providerList.load);
    }),
  );

  it.effect("a value with no usable providers reads as no list", () =>
    Effect.gen(function* () {
      const kv = stubKv();
      kv.values.set(
        PROVIDER_LIST_KEY,
        JSON.stringify({
          updatedAt: FILE.updatedAt,
          providers: [{ baseUrl: "http://insecure.test" }],
        }),
      );
      const providerList = yield* list(kv);

      assertNone(yield* providerList.load);
    }),
  );

  it.effect("a failing write is reported, not swallowed", () =>
    Effect.gen(function* () {
      const kv = { ...stubKv(), put: () => Promise.reject(new Error("binding down")) };
      const providerList = yield* list(kv);

      const result = yield* providerList.save(FILE).pipe(Effect.result);

      assert.strictEqual(result._tag, "Failure");
    }),
  );
});
