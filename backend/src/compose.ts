import { Context, Effect, Layer } from "effect";
import type { Mutable, WatchOutcome } from "../../src/lib/types";
import { Cache } from "./cache";
import { Handler } from "./handler";
import type { HandlerInput } from "./handler";
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

export type SiteBindings = Bindings;

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

// The HTTP boundary: one id in, one stream link out.
export interface WatchInput {
  readonly id: string;
  readonly kind?: "movie" | "tv";
  readonly strictKind?: boolean;
  readonly name?: string;
  readonly year?: string;
  readonly exclude?: string;
}

export interface SiteShape {
  readonly watch: (input: WatchInput) => Effect.Effect<WatchOutcome>;
}

export class Site extends Context.Service<Site, SiteShape>()("watch/backend/Site") {
  static readonly layer: Layer.Layer<Site, never, Handler> = Layer.effect(
    Site,
    Effect.gen(function* () {
      const handler = yield* Handler;

      const watch = Effect.fnUntraced(function* (input: WatchInput) {
        const handlerInput: Mutable<HandlerInput> = { id: input.id };
        if (input.kind !== undefined) {
          handlerInput.kind = input.kind;
        }
        if (input.strictKind !== undefined) {
          handlerInput.strictKind = input.strictKind;
        }
        if (input.name !== undefined) {
          handlerInput.name = input.name;
        }
        if (input.year !== undefined) {
          handlerInput.year = input.year;
        }
        if (input.exclude !== undefined) {
          handlerInput.exclude = input.exclude;
        }
        return yield* handler.handle(handlerInput);
      });

      return Site.of({ watch });
    }),
  );
}

export const siteLayer = (bindings: SiteBindings): Layer.Layer<Site> =>
  Site.layer.pipe(Layer.provide(handlerLayer()), Layer.provide(transportLayer(bindings)));

const composeSite = (bindings: SiteBindings): SiteShape =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Site;
    }).pipe(Effect.provide(siteLayer(bindings))),
  );

// A KV-backed site holds no state, so a request may build one. The memory
// fallback must survive requests, or every instance refetches.
let memorySite: SiteShape | undefined;

export const siteFor = (bindings: SiteBindings = {}): SiteShape => {
  if (bindings.CACHE !== undefined || bindings.PROVIDERS !== undefined) {
    return composeSite(bindings);
  }
  memorySite ??= composeSite(bindings);
  return memorySite;
};

// Kept for the handler-level tests and for one-off scripts.
export const composeHandler = (bindings: Bindings) =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Handler;
    }).pipe(Effect.provide(handlerLayer().pipe(Layer.provide(transportLayer(bindings))))),
  );
