import { SITE_URL } from "../consts";
import type { ContentType } from "./types";

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
export const DIRECTORY_URL = "https://vidsrc.domains/";

// The refresh file: written twice weekly by scripts/refresh-providers.ts and
// read by the app. One name, so a rename cannot leave a reader on the old path.
export const PROVIDERS_FILENAME = "providers.json";
export const PROVIDERS_FILE_URL = `${SITE_URL}/${PROVIDERS_FILENAME}`;

export interface Provider {
  readonly name: string;
  readonly baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  readonly path?: (type: ContentType, id: string) => string;
}

// One entry of the refresh file. The cron writer and the app reader share this
// type: a file row carries no embed path override, every listed host answers
// the default shape, and static fallbacks keep their paths in code.
export type ProviderEntry = Pick<Provider, "name" | "baseUrl">;

export interface ProvidersFile {
  readonly updatedAt: string;
  readonly providers: ReadonlyArray<ProviderEntry>;
}

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
