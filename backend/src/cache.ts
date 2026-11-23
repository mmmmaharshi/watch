import { Clock, Context, Effect, Layer, Option } from "effect";

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
}
