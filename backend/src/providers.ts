import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { PROBE_TIMEOUT_MS } from "../../src/lib/provider-probes";
import {
  DIRECTORY_URL,
  VIDFAST,
  VIDLINK,
  VIDZEE,
  buildEmbedUrl,
  originIfHttps,
  parseActiveDomains,
} from "../../src/lib/providers";
import type { Provider, ProviderEntry, ProvidersFile } from "../../src/lib/providers";
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
export const PROVIDERS_TTL_MS = 60 * 60 * 1000;
export const PROVIDERS_STALE_MS = 48 * 60 * 60 * 1000;
// A chosen provider is remembered briefly, so "Get another stream link" moves on.
const STREAM_TTL_MS = 5 * 60 * 1000;

const LOAD_TIMEOUT_MS = 5000;

function toProviders(baseUrls: ReadonlyArray<string>): Array<Provider> {
  return baseUrls.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl }));
}

interface RefreshFile {
  readonly domains: ReadonlyArray<string>;
  readonly updatedAt: number;
}

export const PROVIDER_LIST_KEY = "providers";

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

// Entries are taken as listed (https-parse only, no name gate): a bad entry
// costs one failed probe. Malformed or non-https entries are dropped.
export const parseProvidersFile = (value: unknown): Option.Option<ProvidersFile> => {
  if (!isObject(value) || !("providers" in value) || !Array.isArray(value.providers)) {
    return Option.none();
  }
  const providers: Array<ProviderEntry> = [];
  const seen = new Set<string>();
  for (const entry of value.providers) {
    if (!isObject(entry) || !("baseUrl" in entry) || typeof entry.baseUrl !== "string") {
      continue;
    }
    const baseUrl = originIfHttps(entry.baseUrl);
    if (baseUrl === null || seen.has(baseUrl)) {
      continue;
    }
    seen.add(baseUrl);
    const name =
      "name" in entry && typeof entry.name === "string" && entry.name !== ""
        ? entry.name
        : new URL(baseUrl).host;
    providers.push({ name, baseUrl });
  }
  if (!providers.length) {
    return Option.none();
  }
  // An unparseable updatedAt means stale, not missing: the list still serves
  // when the directory is down.
  const updatedAt =
    "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : "";
  return Option.some({ updatedAt, providers });
};

const toRefreshFile = (file: ProvidersFile): RefreshFile => ({
  domains: file.providers.map((entry) => entry.baseUrl),
  updatedAt: Date.parse(file.updatedAt),
});

const loadRefreshFile = (http: HttpShape, fileUrl: string) =>
  http.getJson(fileUrl, Schema.Unknown).pipe(
    Effect.timeoutOrElse({
      duration: LOAD_TIMEOUT_MS,
      orElse: () => Effect.fail(new HttpError({ url: fileUrl })),
    }),
    Effect.map((value): Option.Option<RefreshFile> => {
      const parsed = parseProvidersFile(value);
      return Option.isSome(parsed) ? Option.some(toRefreshFile(parsed.value)) : Option.none();
    }),
    Effect.orElseSucceed(() => Option.none<RefreshFile>()),
  );

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
  static readonly layer = (
    fileUrl: string,
  ): Layer.Layer<Providers, never, Http | Cache | ProviderList> =>
    Layer.effect(
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

          // Shared storage first; the committed file is the current home and
          // stays as a fallback until KV holds the list.
          const stored = yield* providerList.load;
          const file = Option.isSome(stored)
            ? Option.some(toRefreshFile(stored.value))
            : yield* loadRefreshFile(http, fileUrl);
          if (Option.isSome(file)) {
            const age = (yield* Clock.currentTimeMillis) - file.value.updatedAt;
            if (age <= PROVIDERS_STALE_MS) {
              yield* cache.set(DOMAINS_KEY, file.value.domains.join("\n"), PROVIDERS_TTL_MS);
              return toProviders(file.value.domains);
            }
          }

          const live = yield* fetchDirectoryDomains(http);
          if (live.length) {
            yield* cache.set(DOMAINS_KEY, live.join("\n"), PROVIDERS_TTL_MS);
            return toProviders(live);
          }

          // A stale file still names hosts; the per-request probe vets them.
          return toProviders(Option.isSome(file) ? file.value.domains : []);
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
