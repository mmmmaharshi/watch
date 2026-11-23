import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import { Cache } from "./cache";
import { Http, HttpError } from "./http";
import type { HttpShape } from "./http";

export type ContentType = "movie" | "tv";

export interface Provider {
  readonly name: string;
  readonly baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  readonly path?: (type: ContentType, id: string) => string;
}

export interface Stream {
  readonly url: string;
  readonly provider: string;
}

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
export const DIRECTORY_URL = "https://vidsrc.domains/";

// A fresh refresh file answers alone. Older than this, the file still serves
// when the directory is down, but a live directory wins.
export const PROVIDERS_TTL_MS = 60 * 60 * 1000;
export const PROVIDERS_STALE_MS = 48 * 60 * 60 * 1000;
// A chosen provider is remembered briefly, so "Get another stream link" moves on.
const STREAM_TTL_MS = 5 * 60 * 1000;

const LOAD_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 8000;

// Static fallbacks, tried after every directory domain fails. TV needs
// season/episode, default to 1/1.
export const VIDLINK: Provider = {
  name: "vidlink.pro",
  baseUrl: "https://vidlink.pro",
  path: (type, id) => (type === "movie" ? `/movie/${id}` : `/tv/${id}/1/1`),
};

export const VIDZEE: Provider = {
  name: "player.vidzee.wtf",
  baseUrl: "https://player.vidzee.wtf",
};

export const VIDFAST: Provider = {
  name: "vidfast.vc",
  baseUrl: "https://vidfast.vc",
  path: (type, id) => (type === "movie" ? `/movie/${id}` : `/tv/${id}/1/1`),
};

// Trust comes from provenance, not names: entries are accepted only from our
// cron-written file or the curator's active directory section (both TLS), and
// every candidate faces a live probe before the user is sent anywhere.
export function originIfHttps(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

// Active domains sit in the #domains section, each row carrying its URL in a
// data-val copy button; the #old section lists retired hosts.
export function parseActiveDomains(html: string): Array<string> {
  const start = html.indexOf('id="domains"');
  if (start === -1) {
    return [];
  }
  const end = html.indexOf('id="old"', start);
  const section = html.slice(start, end === -1 ? undefined : end);
  const urls = [...section.matchAll(/data-val="([^"]+)"/g)].flatMap((match) => {
    const origin = originIfHttps(match[1] ?? "");
    return origin ? [origin] : [];
  });
  return [...new Set(urls)];
}

function toProviders(baseUrls: ReadonlyArray<string>): Array<Provider> {
  return baseUrls.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl }));
}

export function buildEmbedUrl(provider: Provider, type: ContentType, id: string): string {
  return provider.baseUrl + (provider.path ? provider.path(type, id) : `/embed/${type}/${id}`);
}

interface RefreshFile {
  readonly domains: ReadonlyArray<string>;
  readonly updatedAt: number;
}

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

// Entries are taken as listed (https-parse only, no name gate): a bad entry
// costs one failed probe. Malformed or non-https entries are dropped.
const parseRefreshFile = (value: unknown): Option.Option<RefreshFile> => {
  if (!isObject(value) || !("providers" in value) || !Array.isArray(value.providers)) {
    return Option.none();
  }
  const domains: Array<string> = [];
  for (const entry of value.providers) {
    if (!isObject(entry) || !("baseUrl" in entry) || typeof entry.baseUrl !== "string") {
      continue;
    }
    const origin = originIfHttps(entry.baseUrl);
    if (origin !== null) {
      domains.push(origin);
    }
  }
  if (!domains.length) {
    return Option.none();
  }
  // An unparseable updatedAt means stale, not missing: the file still serves
  // when the directory is down.
  const updatedAt =
    "updatedAt" in value && typeof value.updatedAt === "string"
      ? Date.parse(value.updatedAt)
      : Number.NaN;
  return Option.some({ domains: [...new Set(domains)], updatedAt });
};

const loadRefreshFile = (http: HttpShape, fileUrl: string) =>
  http.getJson(fileUrl, Schema.Unknown).pipe(
    Effect.timeoutOrElse({
      duration: LOAD_TIMEOUT_MS,
      orElse: () => Effect.fail(new HttpError({ url: fileUrl })),
    }),
    Effect.map(parseRefreshFile),
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
  static readonly layer = (fileUrl: string): Layer.Layer<Providers, never, Http | Cache> =>
    Layer.effect(
      Providers,
      Effect.gen(function* () {
        const http = yield* Http;
        const cache = yield* Cache;

        const loadProviders = Effect.fnUntraced(function* () {
          const cached = yield* cache.get(DOMAINS_KEY);
          if (Option.isSome(cached)) {
            return toProviders(cached.value.split("\n"));
          }

          const file = yield* loadRefreshFile(http, fileUrl);
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
