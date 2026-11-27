import { Option } from "effect";
import type { ContentType } from "./types";

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
export const DIRECTORY_URL = "https://vidsrc.domains/";

export interface Provider {
  readonly name: string;
  readonly baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  readonly path?: (type: ContentType, id: string) => string;
  // A 2xx is not proof of a title: some hosts answer a not-found page with 200.
  // When set, the body must also pass this check.
  readonly alive?: (body: string) => boolean;
}

// One entry of the stored provider list. The cron writer and the app reader
// share this type: a stored row carries no embed path override, every listed
// host answers the default shape, and static fallbacks keep their paths in code.
export type ProviderEntry = Pick<Provider, "name" | "baseUrl">;

export interface ProvidersFile {
  readonly updatedAt: string;
  readonly providers: ReadonlyArray<ProviderEntry>;
}

// The KV key the refresh cron writes and the app reads.
export const PROVIDER_LIST_KEY = "providers";

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

// A stored entry is always the origin plus its host name. The writer and the
// reader share this one derivation, so the file cannot drift.
export function providerEntries(origins: ReadonlyArray<string>): Array<ProviderEntry> {
  const seen = new Set<string>();
  const entries: Array<ProviderEntry> = [];
  for (const raw of origins) {
    const baseUrl = originIfHttps(raw);
    if (baseUrl === null || seen.has(baseUrl)) {
      continue;
    }
    seen.add(baseUrl);
    entries.push({ name: new URL(baseUrl).host, baseUrl });
  }
  return entries;
}

// Entries are taken as listed (https-parse only, no name gate): a bad entry
// costs one failed probe. Malformed or non-https entries are dropped, and the
// name is always the host, so the writer and the reader cannot drift.
export function parseProvidersFile(value: unknown): Option.Option<ProvidersFile> {
  if (!isObject(value) || !("providers" in value) || !Array.isArray(value.providers)) {
    return Option.none();
  }
  const origins = value.providers.flatMap((entry) =>
    isObject(entry) && "baseUrl" in entry && typeof entry.baseUrl === "string"
      ? [entry.baseUrl]
      : [],
  );
  const providers = providerEntries(origins);
  if (!providers.length) {
    return Option.none();
  }
  // An unparseable updatedAt means stale, not missing: the list still serves
  // when the directory is down.
  const updatedAt =
    "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : "";
  return Option.some({ updatedAt, providers });
}

// Static fallbacks, tried after every directory domain fails. VidFast is the
// last resort. TV needs season/episode, default to 1/1.
const firstEpisodePath = (type: ContentType, id: string) =>
  type === "movie" ? `/embed/movie/${id}` : `/embed/tv/${id}/1/1`;

const plainEpisodePath = (type: ContentType, id: string) =>
  type === "movie" ? `/movie/${id}` : `/tv/${id}/1/1`;

export const VIDLINK: Provider = {
  name: "vidlink.pro",
  baseUrl: "https://vidlink.pro",
  path: plainEpisodePath,
  // A real title answers 200 with this marker; a bogus one answers 500.
  alive: (body) => /tmdb|vidlink/i.test(body),
};

// VidZee, Nxsha and 2Embed share one shape. The bare TV path is 404, so TV
// always carries 1/1.
export const VIDZEE: Provider = {
  name: "player.vidzee.wtf",
  baseUrl: "https://player.vidzee.wtf",
  path: firstEpisodePath,
  alive: (body) => /tmdb|vidzee/i.test(body),
};

// Both take the IMDb id directly and show a real per-title signal: the valid
// title appears in the body and a bogus id gets an error page.
export const NXSHA: Provider = {
  name: "nxsha.space",
  baseUrl: "https://nxsha.space",
  path: firstEpisodePath,
};

export const TWOEMBED: Provider = {
  name: "2embed.stream",
  baseUrl: "https://2embed.stream",
  path: firstEpisodePath,
};

// A real title renders its name; a bogus id does not. Both answer 200, so the
// probe only checks reachability.
export const VIDCORE: Provider = {
  name: "vidcore.net",
  baseUrl: "https://vidcore.net",
  path: plainEpisodePath,
};

export const VIDFAST: Provider = {
  name: "vidfast.vc",
  baseUrl: "https://vidfast.vc",
  path: plainEpisodePath,
};

// No name-based allowlist: a pattern (vidsrc*) trusts blindly, and an exact
// list blocks legit new mirrors. Trust comes from provenance instead: entries
// are accepted only from our cron-written file or the curator's active
// directory section (both TLS), and every candidate still faces a live probe
// per request before the user is sent anywhere. A bad entry can cost one failed
// probe, never a redirect.
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

export function buildEmbedUrl(provider: Provider, type: ContentType, id: string): string {
  return provider.baseUrl + (provider.path ? provider.path(type, id) : `/embed/${type}/${id}`);
}

// vidfast.domains lists the official mirrors as bare origin links. A mirror
// link carries no path, which drops the support and Discord links beside it.
export const VIDFAST_DIRECTORY_URL = "https://vidfast.domains/";

export function parseMirrorOrigins(html: string): Array<string> {
  const urls = [...html.matchAll(/href="(https:\/\/[^"/]+)\/?"/g)].flatMap((match) => {
    const origin = originIfHttps(match[1] ?? "");
    return origin ? [origin] : [];
  });
  return [...new Set(urls)];
}

// One static provider and, when it publishes one, the page that lists its live
// mirrors. The tier order below is the only place that order is written.
export interface ProviderSpec {
  readonly provider: Provider;
  readonly directory?: {
    readonly url: string;
    readonly parse: (html: string) => Array<string>;
  };
}

// Every tier is raced; the next runs only when the whole tier fails.
export const PROVIDER_TIERS: ReadonlyArray<ReadonlyArray<ProviderSpec>> = [
  [{ provider: VIDLINK }, { provider: VIDZEE }],
  [{ provider: NXSHA }, { provider: TWOEMBED }, { provider: VIDCORE }],
  [{ provider: VIDFAST, directory: { url: VIDFAST_DIRECTORY_URL, parse: parseMirrorOrigins } }],
];
