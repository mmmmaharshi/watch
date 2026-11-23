import { Clock, Context, Effect, Layer, Option } from "effect";
import type { KvNamespace } from "./kv";

// KV expiry is whole seconds with a 60s floor.
const KV_MIN_TTL_SECONDS = 60;

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

export class Cache extends Context.Service<
  Cache,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<string>>;
    readonly set: (key: string, value: string, ttlMillis: number) => Effect.Effect<void>;
  }
>()("watch/backend/Cache") {
  static readonly layer = (maxEntries: number): Layer.Layer<Cache> =>
    Layer.effect(
      Cache,
      Effect.gen(function* () {
        if (maxEntries < 1) {
          return yield* Effect.die(
            new Error(`Cache maxEntries must be at least 1, got ${maxEntries}`),
          );
        }

        // Map order is recency order: the first key is the next to evict.
        const entries = new Map<string, Entry>();

        const get = Effect.fnUntraced(function* (key: string) {
          const entry = entries.get(key);
          if (entry === undefined) {
            return Option.none<string>();
          }
          if ((yield* Clock.currentTimeMillis) >= entry.expiresAt) {
            entries.delete(key);
            return Option.none<string>();
          }
          entries.delete(key);
          entries.set(key, entry);
          return Option.some(entry.value);
        });

        const set = Effect.fnUntraced(function* (key: string, value: string, ttlMillis: number) {
          const expiresAt = (yield* Clock.currentTimeMillis) + ttlMillis;
          entries.delete(key);
          entries.set(key, { value, expiresAt });
          if (entries.size > maxEntries) {
            const oldest = entries.keys().next();
            if (!oldest.done) {
              entries.delete(oldest.value);
            }
          }
        });

        return Cache.of({ get, set });
      }),
    );

  // Isolates are evicted at will, so a shared store is the only cache that
  // survives. A KV failure is a miss: the cache is an optimisation, never a
  // dependency.
  // shortcut: KV expiry floors at 60s, so a shorter TTL can outlive itself by
  // under a minute; upgrade to a store with second precision if that matters.
  static readonly layerKv = (kv: KvNamespace): Layer.Layer<Cache> =>
    Layer.succeed(
      Cache,
      Cache.of({
        get: (key) =>
          Effect.tryPromise(() => kv.get(key)).pipe(
            Effect.orElseSucceed(() => null),
            Effect.map((value) => (value === null ? Option.none<string>() : Option.some(value))),
          ),
        set: (key, value, ttlMillis) =>
          Effect.tryPromise(() =>
            kv.put(key, value, {
              expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlMillis / 1000)),
            }),
          ).pipe(Effect.ignore),
      }),
    );
}
