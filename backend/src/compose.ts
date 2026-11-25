import { Context, Effect, Layer, Option } from "effect";
import { PROVIDERS_FILE_URL } from "../../src/lib/providers";
import type { Mutable, SearchInput, SearchOutcome, WatchOutcome } from "../../src/lib/types";
import { Cache } from "./cache";
import { Handler } from "./handler";
import type { HandlerInput } from "./handler";
import { Http } from "./http";
import type { KvNamespace } from "./kv";
import { Mapping } from "./mapping";
import { Metadata } from "./metadata";
import { ProviderList } from "./provider-list";
import { Providers } from "./providers";
import { Search } from "./search";
import { Tmdb } from "./tmdb";

// The bindings the site Worker declares in backend/src/stack.ts. A local run
// has neither KV namespace, so both stores fall back to process memory.
export interface Bindings {
  readonly CACHE?: KvNamespace;
  readonly PROVIDERS?: KvNamespace;
}

export interface SiteBindings extends Bindings {
  readonly TMDB_API_KEY?: string;
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

const tmdbLayer = (key: string | undefined): Layer.Layer<Tmdb, never, Http | Cache> =>
  key === undefined ? Tmdb.disabledLayer : Tmdb.layer(key);

const handlerLayer = (): Layer.Layer<Handler, never, Http | Cache | ProviderList> =>
  Handler.layer.pipe(
    Layer.provide(
      Layer.mergeAll(Mapping.layer, Metadata.layer, Providers.layer(PROVIDERS_FILE_URL)),
    ),
  );

// The HTTP boundary: a watch lookup plus its official availability, and a
// search. One graph, so the search and the watch share one cache.
export interface WatchInput {
  readonly id: string;
  readonly kind?: "movie" | "tv";
  readonly strictKind?: boolean;
  readonly exclude?: string;
  readonly region: string;
}

export interface SiteShape {
  readonly watch: (input: WatchInput) => Effect.Effect<WatchOutcome>;
  readonly search: (input: SearchInput) => Effect.Effect<SearchOutcome>;
}

export class Site extends Context.Service<Site, SiteShape>()("watch/backend/Site") {
  static readonly layer: Layer.Layer<Site, never, Handler | Search | Tmdb> = Layer.effect(
    Site,
    Effect.gen(function* () {
      const handler = yield* Handler;
      const search = yield* Search;
      const tmdb = yield* Tmdb;

      const watch = Effect.fnUntraced(function* (input: WatchInput) {
        const handlerInput: Mutable<HandlerInput> = { id: input.id };
        if (input.kind !== undefined) {
          handlerInput.kind = input.kind;
        }
        if (input.strictKind !== undefined) {
          handlerInput.strictKind = input.strictKind;
        }
        if (input.exclude !== undefined) {
          handlerInput.exclude = input.exclude;
        }
        const outcome = yield* handler.handle(handlerInput);
        if (!outcome.ok || !tmdb.configured) {
          return outcome;
        }
        const official = yield* tmdb.official({
          imdbId: outcome.result.id,
          kind: outcome.result.type,
          region: input.region,
        });
        return Option.isSome(official)
          ? { ok: true as const, result: { ...outcome.result, official: official.value } }
          : outcome;
      });

      return Site.of({ watch, search: search.search });
    }),
  );
}

export const siteLayer = (bindings: SiteBindings): Layer.Layer<Site> => {
  const tmdb = tmdbLayer(bindings.TMDB_API_KEY);
  return Site.layer.pipe(
    Layer.provide(Layer.mergeAll(handlerLayer(), Search.layer.pipe(Layer.provide(tmdb)), tmdb)),
    Layer.provide(transportLayer(bindings)),
  );
};

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
