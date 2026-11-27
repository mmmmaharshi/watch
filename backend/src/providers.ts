import { Clock, Context, Effect, Layer, Option } from "effect";
import { PROBE_TIMEOUT_MS } from "../../src/lib/provider-probes";
import {
  DIRECTORY_URL,
  PROVIDER_TIERS,
  buildEmbedUrl,
  parseActiveDomains,
} from "../../src/lib/providers";
import type { Provider, ProviderSpec } from "../../src/lib/providers";
import type { ContentType } from "../../src/lib/types";
import { Cache } from "./cache";
import { Http, HttpError } from "./http";
import type { HttpShape } from "./http";
import { ProviderList } from "./provider-list";

// The provider facts (hosts, URL shapes, tiers, directory parsers) live in
// src/lib/providers, because the refresh script needs them without Effect.
// This module adds the layer that talks HTTP through the Effect runtime.
export interface Stream {
  readonly url: string;
  readonly provider: string;
}

// A fresh refresh file answers alone. Older than this, the file still serves
// when the directory is down, but a live directory wins.
const PROVIDERS_TTL_MS = 60 * 60 * 1000;
export const PROVIDERS_STALE_MS = 48 * 60 * 60 * 1000;
// A chosen provider is remembered briefly, so "Get another stream link" moves on.
const STREAM_TTL_MS = 5 * 60 * 1000;

const LOAD_TIMEOUT_MS = 5000;

// A stored VidSrc domain carries no shape: the default /embed one is the rule
// for that list, so this constructor takes no template to lose.
const defaultAt = (baseUrl: string): Provider => ({
  name: new URL(baseUrl).host,
  baseUrl,
});

// A listed mirror keeps its provider's own shape and alive check.
const mirrorAt =
  (template: Provider) =>
  (baseUrl: string): Provider => ({
    ...template,
    name: new URL(baseUrl).host,
    baseUrl,
  });

const toProviders = (baseUrls: ReadonlyArray<string>): Array<Provider> => baseUrls.map(defaultAt);

const withTimeout = <A, E, R>(url: string, duration: number, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.timeoutOrElse({ duration, orElse: () => Effect.fail(new HttpError({ url })) }),
  );

const fetchParsed = (http: HttpShape, url: string, parse: (html: string) => Array<string>) =>
  withTimeout(url, LOAD_TIMEOUT_MS, http.getText(url)).pipe(
    Effect.map(parse),
    Effect.orElseSucceed((): Array<string> => []),
  );

const fetchDirectoryDomains = (http: HttpShape) =>
  fetchParsed(http, DIRECTORY_URL, parseActiveDomains);

const probe = (http: HttpShape, provider: Provider, type: ContentType, id: string) => {
  const url = buildEmbedUrl(provider, type, id);
  return withTimeout(url, PROBE_TIMEOUT_MS, http.getText(url)).pipe(
    // A 2xx is not proof of a title: some hosts answer a not-found page with 200.
    Effect.filterOrFail(
      (body) => provider.alive === undefined || provider.alive(body),
      () => new HttpError({ url }),
    ),
    Effect.as({ url, provider: provider.name }),
  );
};

export interface ProvidersShape {
  readonly selectStream: (args: {
    readonly type: ContentType;
    readonly id: string;
    readonly exclude?: string;
  }) => Effect.Effect<Option.Option<Stream>>;
}

// Cache holds strings, so a domain list travels newline-joined (URLs never
// contain a newline).
const DOMAINS_KEY = "providers:domains";
const mirrorKey = (template: Provider) => `providers:mirror:${template.name}`;
const streamKey = (type: ContentType, id: string) => `providers:stream:${type}:${id}`;

export class Providers extends Context.Service<Providers, ProvidersShape>()(
  "watch/backend/Providers",
) {
  static readonly layer: Layer.Layer<Providers, never, Http | Cache | ProviderList> = Layer.effect(
    Providers,
    Effect.gen(function* () {
      const http = yield* Http;
      const cache = yield* Cache;
      const providerList = yield* ProviderList;

      // A directory replaces its template's single host with the live mirrors.
      // A down page falls back to the template's own host, so nothing is lost.
      const loadMirrors = Effect.fnUntraced(function* (
        template: Provider,
        directory: NonNullable<ProviderSpec["directory"]>,
      ) {
        const at = mirrorAt(template);
        const key = mirrorKey(template);
        const cached = yield* cache.get(key);
        if (Option.isSome(cached)) {
          return cached.value.split("\n").map(at);
        }
        const live = yield* fetchParsed(http, directory.url, directory.parse).pipe(
          Effect.map((origins) =>
            origins.filter((origin) => origin !== new URL(directory.url).origin),
          ),
        );
        // Cache the fallback too, so a down page costs one fetch, not one per lookup.
        const origins = live.length ? live : [template.baseUrl];
        yield* cache.set(key, origins.join("\n"), PROVIDERS_TTL_MS);
        return origins.map(at);
      });

      const loadTier = (tier: ReadonlyArray<ProviderSpec>) =>
        Effect.forEach(tier, (spec) =>
          spec.directory === undefined
            ? Effect.succeed([spec.provider])
            : loadMirrors(spec.provider, spec.directory),
        ).pipe(Effect.map((lists) => lists.flat()));

      const loadProviders = Effect.fnUntraced(function* () {
        const cached = yield* cache.get(DOMAINS_KEY);
        if (Option.isSome(cached)) {
          return toProviders(cached.value.split("\n"));
        }

        // Shared storage first; the live directory fills when the stored
        // list is stale or missing.
        const stored = yield* providerList.load;
        if (Option.isSome(stored)) {
          const bases = stored.value.providers.map((entry) => entry.baseUrl);
          const updatedAt = Date.parse(stored.value.updatedAt);
          // An unparseable timestamp is stale, not fresh.
          const age = (yield* Clock.currentTimeMillis) - updatedAt;
          if (!Number.isNaN(age) && age <= PROVIDERS_STALE_MS) {
            yield* cache.set(DOMAINS_KEY, bases.join("\n"), PROVIDERS_TTL_MS);
            return toProviders(bases);
          }
        }

        const live = yield* fetchDirectoryDomains(http);
        if (live.length) {
          yield* cache.set(DOMAINS_KEY, live.join("\n"), PROVIDERS_TTL_MS);
          return toProviders(live);
        }

        // A stale list still names hosts; the per-request probe vets them.
        return toProviders(
          Option.isSome(stored) ? stored.value.providers.map((entry) => entry.baseUrl) : [],
        );
      });

      const selectStream = Effect.fnUntraced(function* (args: {
        readonly type: ContentType;
        readonly id: string;
        readonly exclude?: string;
      }) {
        const providers = yield* loadProviders();
        const staticTiers = yield* Effect.forEach(PROVIDER_TIERS, loadTier);
        const tiers: ReadonlyArray<ReadonlyArray<Provider>> = [providers, ...staticTiers];
        // A retry leaves a whole directory: another mirror of the same host is
        // not another stream. A static tier keeps its siblings.
        const directoryTiers = new Set<ReadonlyArray<Provider>>([
          providers,
          ...staticTiers.filter((_, index) =>
            PROVIDER_TIERS[index]?.some((spec) => spec.directory !== undefined),
          ),
        ]);
        const key = streamKey(args.type, args.id);
        const cachedName = yield* cache.get(key);
        // A remembered provider is probed before the directory on a repeat lookup.
        const known = tiers.flat();
        const cached = Option.isSome(cachedName)
          ? known.find((provider) => provider.name === cachedName.value)
          : undefined;
        const order = (cached === undefined ? tiers : [[cached], ...tiers]).filter(
          (tier) =>
            args.exclude === undefined ||
            !(directoryTiers.has(tier) && tier.some((provider) => provider.name === args.exclude)),
        );

        for (const tier of order) {
          const candidates = tier.filter((provider) => provider.name !== args.exclude);
          if (!candidates.length) {
            continue;
          }
          // raceAll interrupts the losers, so they stop at their own timeouts.
          // shortcut: Http takes no abort signal, so a losing fetch stops in the
          // fiber but not on the wire; widen HttpShape when request volume matters.
          const winner = yield* Effect.raceAll(
            candidates.map((provider) => probe(http, provider, args.type, args.id)),
          ).pipe(Effect.option);
          if (Option.isSome(winner)) {
            yield* cache.set(key, winner.value.provider, STREAM_TTL_MS);
            return winner;
          }
        }
        return Option.none<Stream>();
      });

      return Providers.of({ selectStream });
    }),
  );
}
