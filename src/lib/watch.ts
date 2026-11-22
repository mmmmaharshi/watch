import { TMDB_NOT_FOUND } from "./messages";
import { parseTitleInput } from "./parse-input";
import { resolveImdbId } from "./tmdb";
import { SITE_URL } from "../consts";
import type { ContentType, WatchOutcome } from "./types";

export type { ContentType, WatchResult } from "./types";
export { unwrapActionResult } from "./action-result";

// Backend for /api/watch. Pure logic, no static serving (Astro owns the page).
interface MetaJson {
  meta?: {
    name?: string;
    year?: string;
    releaseInfo?: string;
    imdbRating?: string;
    description?: string;
  };
}

// Third-party JSON; call sites check the shape before use.
type JsonValue = string | number | boolean | null | Array<JsonValue> | { [key: string]: JsonValue };
export type LooseJson = MetaJson & { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

export function isLooseJson(value: unknown): value is LooseJson {
  return isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface HttpClient {
  get(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<{
    ok: boolean;
    json: () => Promise<LooseJson>;
    text: () => Promise<string>;
  }>;
}

export const defaultHttpClient: HttpClient = {
  get: async (url, options) => {
    const res = await fetch(url, options);
    return {
      ok: res.ok,
      json: async () => {
        const value: unknown = await res.json();
        return isLooseJson(value) ? value : {};
      },
      text: () => res.text(),
    };
  },
};

export class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(
    private ttl: number,
    private maxEntries = 1000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry && entry.expires > Date.now()) {
      // LRU: move to the end so hot entries survive eviction.
      this.store.delete(key);
      this.store.set(key, entry);
      return entry.value;
    }
    this.store.delete(key);
    return undefined;
  }

  set(key: string, value: T, ttl: number = this.ttl): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expires: Date.now() + ttl });
  }
}

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
// Fallback only. The refresh file (PROVIDERS_FILE_URL) is the source of
// truth for the active list; the directory answers only when the file is
// stale or missing.
export const DIRECTORY_URL = "https://vidsrc.domains/";

// Refresh file written twice weekly by scripts/refresh-providers.ts (#27).
// Absolute so the serverless fetch has a host; preview and dev read the
// same prod file.
export const PROVIDERS_FILE_URL = `${SITE_URL}/providers.json`;
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

// Active domains sit in the #domains section, each row carrying its URL in a
// data-val copy button.

// Static fallbacks, tried after every directory domain fails. VidFast goes
// last. TV needs season/episode, default to 1/1. VidZee keeps the default
// /embed/{type}/{id} path: probe-26 fetched /embed/movie/tt0133093 and got
// the Vidzee Movie Player shell, so the default shape is verified.
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
// Parse once, https only. Null when the URL is bad or not https.
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
    const origin = originIfHttps(m[1]);
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
function parseRefreshFile(value: LooseJson): { domains: Array<string>; updatedAt: number } | null {
  const providers = value.providers;
  if (!Array.isArray(providers)) {
    return null;
  }
  const domains: Array<string> = [];
  for (const entry of providers) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const baseUrl = (entry as { baseUrl?: unknown }).baseUrl;
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
  // Stale file still beats nothing.
  if (file !== null) {
    return toProviders(file.domains);
  }
  return toProviders([]);
}

export interface TitleMeta {
  type: ContentType;
  name: string;
  year?: string;
  rating?: string;
  description?: string;
}

export type TypeResult = { ok: true; meta: TitleMeta } | { ok: false; reason: string };

const META_TIMEOUT_MS = 5000;
const NEGATIVE_TTL_MS = 60_000;

interface FetchKindResult {
  meta: TitleMeta | null;
  transient: boolean;
}

async function fetchKind(
  kind: "series" | "movie",
  id: string,
  http: HttpClient,
  parent?: AbortSignal,
): Promise<FetchKindResult> {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`;
    const timeout = AbortSignal.timeout(META_TIMEOUT_MS);
    const res = await http.get(url, {
      signal: parent ? AbortSignal.any([timeout, parent]) : timeout,
    });
    if (!res.ok) {
      return { meta: null, transient: false };
    }
    const m = (await res.json()).meta;
    if (!m?.name) {
      return { meta: null, transient: false };
    }
    return {
      meta: {
        type: kind === "series" ? "tv" : "movie",
        name: m.name,
        year: m.year || m.releaseInfo,
        rating: m.imdbRating,
        description: m.description,
      },
      transient: false,
    };
  } catch {
    return { meta: null, transient: true };
  }
}

async function fetchMeta(
  id: string,
  http: HttpClient,
  preferred?: ContentType,
): Promise<{ meta: TitleMeta | null; transient: boolean }> {
  if (preferred) {
    const firstKind = preferred === "tv" ? "series" : "movie";
    const secondKind = firstKind === "series" ? "movie" : "series";
    const first = await fetchKind(firstKind, id, http);
    if (first.meta) {
      return first;
    }
    const second = await fetchKind(secondKind, id, http);
    return { meta: second.meta, transient: first.transient || second.transient };
  }
  const ctrl = new AbortController();
  try {
    const seriesPromise = fetchKind("series", id, http, ctrl.signal).then((result) => ({
      which: "series" as const,
      result,
    }));
    const moviePromise = fetchKind("movie", id, http, ctrl.signal).then((result) => ({
      which: "movie" as const,
      result,
    }));
    const first = await Promise.race([seriesPromise, moviePromise]);
    if (first.result.meta) {
      return first.result;
    }
    const other = first.which === "series" ? await moviePromise : await seriesPromise;
    return { meta: other.result.meta, transient: first.result.transient || other.result.transient };
  } finally {
    // Losers would otherwise run to their own timeouts.
    ctrl.abort();
  }
}

export async function resolveTitle(
  id: string,
  http: HttpClient,
  cache: Cache<TypeResult>,
  preferred?: ContentType,
): Promise<TypeResult> {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const fetched = await fetchMeta(id, http, preferred);
  const meta = fetched.meta;
  if (!meta) {
    const fallback = await fetchTVMaze(id, http);
    if (fallback) {
      const result: TypeResult = { ok: true, meta: fallback };
      cache.set(id, result);
      return result;
    }
    const miss: TypeResult = { ok: false, reason: "Metadata not found" };
    if (!fetched.transient) {
      cache.set(id, miss, NEGATIVE_TTL_MS);
    }
    return miss;
  }

  const result: TypeResult = { ok: true, meta };
  cache.set(id, result);
  return result;
}

const TVMAZE_TIMEOUT_MS = 5000;

export async function fetchTVMaze(id: string, http: HttpClient): Promise<TitleMeta | null> {
  try {
    const res = await http.get(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, {
      signal: AbortSignal.timeout(TVMAZE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const m = await res.json();
    if (typeof m.name !== "string") {
      return null;
    }
    const year = typeof m.premiered === "string" ? m.premiered.slice(0, 4) : undefined;
    const summary =
      typeof m.summary === "string" ? m.summary.replaceAll(/<[^>]*>/g, "").trim() : undefined;
    return { type: "tv", name: m.name, year, description: summary };
  } catch {
    return null;
  }
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

const MAX_TRACKED_IPS = 10_000;

export function createRateLimiter(
  windowMs: number,
  maxAttempts: number,
  now: () => number = Date.now,
) {
  const attempts = new Map<string, { count: number; expires: number }>();

  return function isLimited(ip: string): boolean {
    const at = now();
    const entry = attempts.get(ip);
    if (!entry || entry.expires < at) {
      if (attempts.size >= MAX_TRACKED_IPS) {
        for (const [key, e] of attempts) {
          if (e.expires < at) {
            attempts.delete(key);
          }
        }
        if (attempts.size >= MAX_TRACKED_IPS) {
          const oldest = attempts.keys().next().value;
          if (oldest !== undefined) {
            attempts.delete(oldest);
          }
        }
      }
      attempts.set(ip, { count: 1, expires: at + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > maxAttempts;
  };
}

export const JSON_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json",
  "Content-Security-Policy": "default-src 'none'",
  "Cache-Control": "no-store",
} satisfies Record<string, string>;

export interface WatchDeps {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  domainCache: Cache<Array<string>>;
}

// One shape for every transport. Status mirrors the old API. The kind hint
// comes from the Movie/TV selector: a bare TMDB number takes it, so the
// ambiguous dual lookup never runs for UI flows.
export async function handleWatchRequest(
  deps: WatchDeps,
  input: { id: string; exclude?: string; kind?: ContentType },
): Promise<WatchOutcome> {
  const { http, typeCache, providerCache, domainCache } = deps;

  const parsed = parseTitleInput(input.id, input.kind);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      reason: "invalid_input",
      error: "Invalid IMDb or TMDB ID",
    };
  }

  let id: string;
  let preferred: ContentType | undefined;
  if (parsed.kind === "imdb") {
    id = parsed.id;
  } else {
    const mapped = await resolveImdbId(http, parsed.type, parsed.id);
    if (!mapped.ok) {
      return {
        ok: false,
        status: mapped.reason === "ambiguous" ? 400 : 502,
        reason: mapped.reason === "ambiguous" ? "tmdb_ambiguous" : "tmdb_not_found",
        error:
          mapped.reason === "ambiguous"
            ? "TMDB ID is ambiguous. Use a movie or TV link."
            : TMDB_NOT_FOUND,
      };
    }
    id = mapped.match.id;
    preferred = mapped.match.type;
  }

  const typeResult = await resolveTitle(id, http, typeCache, preferred);
  if (!typeResult.ok) {
    return {
      ok: false,
      status: 502,
      reason: "metadata_missing",
      error: "Failed to detect content type",
    };
  }

  const stream = await selectStream({
    http,
    type: typeResult.meta.type,
    id,
    exclude: input.exclude,
    providerCache,
    domainCache,
  });
  if (!stream) {
    return {
      ok: false,
      status: 503,
      reason: "no_providers",
      error: "No working providers available",
    };
  }

  return {
    ok: true,
    result: { id, url: stream.url, provider: stream.provider, ...typeResult.meta },
  };
}

// Singletons for the serverless function. Per-instance only;
// use a shared store (e.g. Upstash) if global limits are required.
export const watchDeps: WatchDeps = {
  http: defaultHttpClient,
  typeCache: new Cache<TypeResult>(60 * 60 * 1000),
  providerCache: new Cache<string>(5 * 60 * 1000),
  domainCache: new Cache<Array<string>>(PROVIDERS_TTL_MS),
};

export const isLimited = createRateLimiter(15 * 60 * 1000, 100);

export function clientIp(req: Request): string {
  // Vercel appends the verified client IP last, so earlier entries (spoofable
  // by the caller) are ignored. Direct spoofing of the last entry is not
  // possible through the edge: it always appends the connecting IP.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",");
  const last = forwarded?.at(-1)?.trim();
  return last || "unknown";
}

// The action RPC path. Kept here (not in middleware) so tests can pin it:
// if Astro ever renames the endpoint, the limiter must follow, not silently stop.
export function isActionRequest(req: Request): boolean {
  return new URL(req.url).pathname.startsWith("/_actions");
}

// Null means allowed; a Response means limited. Middleware answers with it.
export function limitResponse(
  req: Request,
  limited: (ip: string) => boolean = isLimited,
): Response | null {
  if (limited(clientIp(req))) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: JSON_HEADERS,
    });
  }
  return null;
}
