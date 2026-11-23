import { Context, Effect, Layer, Option } from "effect";
import type { ProvidersFile } from "../../src/lib/providers";
import type { KvNamespace } from "./kv";
import { PROVIDER_LIST_KEY, parseProvidersFile } from "./providers";

export interface ProviderListShape {
  // A read failure is a miss: the Providers service falls back to the file and
  // the live directory.
  readonly load: Effect.Effect<Option.Option<ProvidersFile>>;
  // A write failure must reach the cron, so it can log a run that stored
  // nothing.
  readonly save: (file: ProvidersFile) => Effect.Effect<void, unknown>;
}

export const providerListFromKv = (kv: KvNamespace): ProviderListShape => ({
  load: Effect.tryPromise(() => kv.get(PROVIDER_LIST_KEY)).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map((text) => {
      if (text === null) {
        return Option.none<ProvidersFile>();
      }
      try {
        return parseProvidersFile(JSON.parse(text) as unknown);
      } catch {
        return Option.none<ProvidersFile>();
      }
    }),
  ),
  save: (file) =>
    Effect.tryPromise({
      try: () => kv.put(PROVIDER_LIST_KEY, JSON.stringify(file)),
      catch: (cause) => cause,
    }).pipe(Effect.as(undefined)),
});

export class ProviderList extends Context.Service<ProviderList, ProviderListShape>()(
  "watch/backend/ProviderList",
) {
  static readonly layerKv = (kv: KvNamespace): Layer.Layer<ProviderList> =>
    Layer.succeed(ProviderList, ProviderList.of(providerListFromKv(kv)));

  // No shared storage: every read misses, so the caller keeps its file and
  // directory fallbacks. Tests and local runs use this.
  static readonly emptyLayer = Layer.succeed(
    ProviderList,
    ProviderList.of({
      load: Effect.succeed(Option.none<ProvidersFile>()),
      save: () => Effect.void,
    }),
  );
}
