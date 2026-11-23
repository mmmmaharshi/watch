import { Effect, Layer } from "effect";
import { PROVIDERS_FILE_URL } from "../../src/lib/providers";
import { Cache } from "./cache";
import { Handler } from "./handler";
import type { HandlerShape } from "./handler";
import { Http } from "./http";
import type { KvNamespace } from "./kv";
import { Mapping } from "./mapping";
import { Metadata } from "./metadata";
import { ProviderList } from "./provider-list";
import { Providers } from "./providers";

// The bindings the site Worker declares in backend/src/stack.ts. A local run
// has neither, so both stores fall back to process memory.
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

// One graph: the handler over the three services, over the transport and the
// two stores. The stores are provided once, so Metadata and Providers share
// the same Cache.
export const handlerLayer = (bindings: Bindings): Layer.Layer<Handler> =>
  Handler.layer.pipe(
    Layer.provide(
      Layer.mergeAll(Mapping.layer, Metadata.layer, Providers.layer(PROVIDERS_FILE_URL)),
    ),
    Layer.provide(
      Layer.mergeAll(Http.fetchLayer, cacheLayer(bindings), providerListLayer(bindings)),
    ),
  );

export const composeHandler = (bindings: Bindings): HandlerShape =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Handler;
    }).pipe(Effect.provide(handlerLayer(bindings))),
  );

// A KV-backed handler holds no state, so a request may build one. The memory
// fallback must survive requests, or every instance refetches.
let memoryHandler: HandlerShape | undefined;

export const handlerFor = (bindings: Bindings = {}): HandlerShape => {
  if (bindings.CACHE !== undefined || bindings.PROVIDERS !== undefined) {
    return composeHandler(bindings);
  }
  memoryHandler ??= composeHandler(bindings);
  return memoryHandler;
};
