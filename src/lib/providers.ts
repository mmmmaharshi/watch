import { SITE_URL } from "../consts";
import type { ContentType } from "./types";
import type { Cache } from "./http";
import type { HttpClient } from "./http";
import { isLooseJson } from "./http";

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
// Fallback only. The refresh file (PROVIDERS_FILE_URL) is the source of
// truth for the active list; the directory answers only when the file is
// stale or missing.
export const DIRECTORY_URL = "https://vidsrc.domains/";

// Refresh file written twice weekly by scripts/refresh-providers.ts.
// Absolute so the serverless fetch has a host; preview and dev read the
// same prod file. The cron job addresses the same file on disk via
// PROVIDERS_FILENAME, so a rename touches both.
export const PROVIDERS_FILENAME = "providers.json";
export const PROVIDERS_FILE_URL = `${SITE_URL}/${PROVIDERS_FILENAME}`;
// A fresh file answers from cache. Older than this, the file still serves
// when the directory is down, but a live directory wins.
export const PROVIDERS_TTL_MS = 60 * 60 * 1000;
export const PROVIDERS_STALE_MS = 48 * 60 * 60 * 1000;

export interface Provider {
  name: string;
  baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  path?: (type: ContentType, id: string) => string;
}

// One entry of the refresh file. The cron writer and the app reader share
// this type: a file row carries no embed path override, every listed host
// answers the default shape, and static fallbacks keep their paths in code.
export type ProviderEntry = Pick<Provider, "name" | "baseUrl">;

export interface ProvidersFile {
  updatedAt: string;
  providers: Array<ProviderEntry>;
}

// Active domains sit in the #domains section, each row carrying its URL in a
// data-val copy button.

// Static fallbacks, tried after every directory domain fails. VidFast goes
// last. TV needs season/episode, default to 1/1. VidZee keeps the default
// /embed/{type}/{id} path: probe-26 fetched /embed/movie/tt0133093 and got the
// Vidzee Movie Player shell, so the default shape is verified.
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

// No name-based allowlist: a pattern (vidsrc*) trusts blindly, and an
// exact list blocks legit new mirrors. Trust comes from provenance instead:
// entries are accepted only from our cron-written file or the curator's
// active directory section (both TLS), and every candidate still faces a
// live probe per request before the user is sent anywhere. A bad entry can
// cost one failed probe, never a redirect.
export function originIfHttps(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function parseActiveDomains(html: string): Array<string> {
  const start = html.indexOf('id="domains"');
  if (start === -1) {
    return [];
  }
  const end = html.indexOf('id="old"', start);
  const section = html.slice(start, end === -1 ? undefined : end);
  const urls = [...section.matchAll(/data-val="([^"]+)"/g)].flatMap((m) => {
    const origin = originIfHttps(m[1] ?? "");
    return origin ? [origin] : [];
  });
  return [...new Set(urls)];
}

function toProviders(baseUrls: Array<string>): Array<Provider> {
  return baseUrls.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl }));
}

export function buildEmbedUrl(provider: Provider, type: ContentType, id: string): string {
  return provider.baseUrl + (provider.path ? provider.path(type, id) : `/embed/${type}/${id}`);
}

// The refresh file is first-party content (our cron commit, same TLS host
// as the app), so entries are taken as listed: https-parse only, no name
// gate. A bad entry costs one failed live probe; the per-request probe in
// selectStream is the safety net, and the cron rewrite bounds persistence
// to days. Malformed or non-https entries are dropped.
function parseRefreshFile(value: unknown): { domains: Array<string>; updatedAt: number } | null {
  if (!isLooseJson(value) || !Array.isArray(value.providers)) {
    return null;
  }
  const domains: Array<string> = [];
  for (const entry of value.providers) {
    if (!isLooseJson(entry)) {
      continue;
    }
    const baseUrl = entry.baseUrl;
    if (typeof baseUrl !== "string") {
      continue;
    }
    const origin = originIfHttps(baseUrl);
    if (origin) {
      domains.push(origin);
    }
  }
  if (!domains.length) {
    return null;
  }
  // An unparseable updatedAt means stale, not missing: the file still serves
  // when the directory is down.
  const updatedAt = typeof value.updatedAt === "string" ? Date.parse(value.updatedAt) : Number.NaN;
  return { domains: [...new Set(domains)], updatedAt };
}

async function fetchDirectoryDomains(http: HttpClient): Promise<Array<string>> {
  try {
    const res = await http.get(DIRECTORY_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return [];
    }
    return parseActiveDomains(await res.text());
  } catch {
    // Directory unreachable — no VidSrc domains this round; VidFast still applies.
    return [];
  }
}

async function loadProviders(
  http: HttpClient,
  cache: Cache<Array<string>>,
): Promise<Array<Provider>> {
  const cached = cache.get("domains");
  if (cached) {
    return toProviders(cached);
  }

  let file: { domains: Array<string>; updatedAt: number } | null = null;
  try {
    const res = await http.get(PROVIDERS_FILE_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      file = parseRefreshFile(await res.json());
    }
  } catch {
    // Missing or unreadable file — fall through to the directory.
  }
  const fresh =
    file !== null &&
    !Number.isNaN(file.updatedAt) &&
    Date.now() - file.updatedAt <= PROVIDERS_STALE_MS;
  if (file !== null && fresh) {
    cache.set("domains", file.domains, PROVIDERS_TTL_MS);
    return toProviders(file.domains);
  }

  const domains = await fetchDirectoryDomains(http);
  if (domains.length) {
    cache.set("domains", domains, PROVIDERS_TTL_MS);
    return toProviders(domains);
  }
  if (file !== null) {
    return toProviders(file.domains);
  }
  return toProviders([]);
}

const PROBE_TIMEOUT_MS = 8000;

async function probeProvider(
  provider: Provider,
  type: ContentType,
  id: string,
  http: HttpClient,
  parent?: AbortSignal,
) {
  const url = buildEmbedUrl(provider, type, id);
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const res = await http.get(url, {
    signal: parent ? AbortSignal.any([timeout, parent]) : timeout,
  });
  if (!res.ok) {
    throw new Error(`${provider.name} unavailable`);
  }
  return { url, provider: provider.name };
}

export async function selectStream(args: {
  http: HttpClient;
  type: ContentType;
  id: string;
  exclude: string | undefined;
  providerCache: Cache<string>;
  domainCache: Cache<Array<string>>;
}): Promise<{ url: string; provider: string } | null> {
  const { http, type, id, exclude, providerCache, domainCache } = args;
  const cacheKey = `${type}:${id}`;
  const providers = await loadProviders(http, domainCache);
  const tiers: Array<Array<Provider>> = [providers, [VIDLINK, VIDZEE], [VIDFAST]];
  const cachedName = providerCache.get(cacheKey);
  const cached = cachedName
    ? [...providers, VIDLINK, VIDZEE, VIDFAST].find((p) => p.name === cachedName)
    : undefined;
  if (cached) {
    tiers.unshift([cached]);
  }

  for (const tier of tiers) {
    const candidates = tier.filter((p) => p.name !== exclude);
    if (!candidates.length) {
      continue;
    }
    const ctrl = new AbortController();
    try {
      const winner = await Promise.any(
        candidates.map((p) => probeProvider(p, type, id, http, ctrl.signal)),
      );
      providerCache.set(cacheKey, winner.provider);
      return winner;
    } catch {
      // This tier failed — try the next one.
    } finally {
      // Losers would otherwise run to their own timeouts.
      ctrl.abort();
    }
  }
  return null;
}
