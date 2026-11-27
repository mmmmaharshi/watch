import { Context, Effect, Layer } from "effect";
import type { LookupInput, WatchOutcome } from "../../src/lib/types";
import { Cache } from "./cache";
import { Handler } from "./handler";
import { Http } from "./http";
import type { KvNamespace } from "./kv";
import { Mapping } from "./mapping";
import { Metadata } from "./metadata";
import { ProviderList } from "./provider-list";
import { Providers } from "./providers";

// The bindings the site Worker declares in backend/src/stack.ts. A local run
// has neither KV namespace, so both stores fall back to process memory.
export interface Bindings {
  readonly CACHE?: KvNamespace;
  readonly PROVIDERS?: KvNamespace;
}

const MEMORY_CACHE_ENTRIES = 500;

export const cacheLayer = (bindings: Bindings): Layer.Layer<Cache> =>
  bindings.CACHE === undefined ? Cache.layer(MEMORY_CACHE_ENTRIES) : Cache.layerKv(bindings.CACHE);

export const providerListLayer = (bindings: Bindings): Layer.Layer<ProviderList> =>
  bindings.PROVIDERS === undefined
    ? ProviderList.emptyLayer
    : ProviderList.layerKv(bindings.PROVIDERS);

const transportLayer = (bindings: Bindings): Layer.Layer<Http | Cache | ProviderList> =>
  Layer.mergeAll(Http.fetchLayer, cacheLayer(bindings), providerListLayer(bindings));

const handlerLayer = (): Layer.Layer<Handler, never, Http | Cache | ProviderList> =>
  Handler.layer.pipe(Layer.provide(Layer.mergeAll(Mapping.layer, Metadata.layer, Providers.layer)));

// The HTTP boundary: one request shape in, one stream link out.
export interface SiteShape {
  readonly watch: (input: LookupInput) => Effect.Effect<WatchOutcome>;
}

export class Site extends Context.Service<Site, SiteShape>()("watch/backend/Site") {
  static readonly layer: Layer.Layer<Site, never, Handler> = Layer.effect(
    Site,
    Effect.gen(function* () {
      const handler = yield* Handler;

      return Site.of({ watch: handler.handle });
    }),
  );
}

export const siteLayer = (bindings: Bindings): Layer.Layer<Site> =>
  Site.layer.pipe(Layer.provide(handlerLayer()), Layer.provide(transportLayer(bindings)));

const composeSite = (bindings: Bindings): SiteShape =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Site;
    }).pipe(Effect.provide(siteLayer(bindings))),
  );

// A KV-backed site holds no state, so a request may build one. The memory
// fallback must survive requests, or every instance refetches.
let memorySite: SiteShape | undefined;

export const siteFor = (bindings: Bindings = {}): SiteShape => {
  if (bindings.CACHE !== undefined || bindings.PROVIDERS !== undefined) {
    return composeSite(bindings);
  }
  memorySite ??= composeSite(bindings);
  return memorySite;
};
