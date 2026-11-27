import { Clock, Context, Effect, Layer, Option } from "effect";
import { PROBE_TIMEOUT_MS } from "../../src/lib/provider-probes";
import {
  DIRECTORY_URL,
  VIDFAST,
  VIDLINK,
  VIDZEE,
  buildEmbedUrl,
  parseActiveDomains,
} from "../../src/lib/providers";
import type { Provider } from "../../src/lib/providers";
import type { ContentType } from "../../src/lib/types";
import { Cache } from "./cache";
import { Http, HttpError } from "./http";
import type { HttpShape } from "./http";
import { ProviderList } from "./provider-list";

// The provider facts (hosts, URL shapes, the directory parser) live in
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

function toProviders(baseUrls: ReadonlyArray<string>): Array<Provider> {
  return baseUrls.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl }));
}

const fetchDirectoryDomains = (http: HttpShape) =>
  http.getText(DIRECTORY_URL).pipe(
    Effect.timeoutOrElse({
      duration: LOAD_TIMEOUT_MS,
      orElse: () => Effect.fail(new HttpError({ url: DIRECTORY_URL })),
    }),
    Effect.map(parseActiveDomains),
    Effect.orElseSucceed((): Array<string> => []),
  );

const probe = (http: HttpShape, provider: Provider, type: ContentType, id: string) => {
  const url = buildEmbedUrl(provider, type, id);
  return http.getText(url).pipe(
    Effect.timeoutOrElse({
      duration: PROBE_TIMEOUT_MS,
      orElse: () => Effect.fail(new HttpError({ url })),
    }),
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
        const key = streamKey(args.type, args.id);
        const cachedName = yield* cache.get(key);
        const known = [...providers, VIDLINK, VIDZEE, VIDFAST];
        const cached = Option.isSome(cachedName)
          ? known.find((provider) => provider.name === cachedName.value)
          : undefined;
        const tiers: ReadonlyArray<ReadonlyArray<Provider>> = [
          ...(cached === undefined ? [] : [[cached]]),
          providers,
          [VIDLINK, VIDZEE],
          [VIDFAST],
        ];

        for (const tier of tiers) {
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
