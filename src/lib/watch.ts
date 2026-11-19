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
type LooseJson = MetaJson & Record<string, unknown>;

export type ContentType = "movie" | "tv";

export interface HttpClient {
  get(url: string, options?: { signal?: AbortSignal }): Promise<{
    ok: boolean;
    json: () => Promise<LooseJson>;
    text: () => Promise<string>;
  }>;
}

export const defaultHttpClient: HttpClient = {
  get: async (url, options) => {
    const res = await fetch(url, options);
    return { ok: res.ok, json: () => res.json() as Promise<LooseJson>, text: () => res.text() };
  },
};

export class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(private ttl: number, private maxEntries = 1000) {}

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
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttl });
  }
}

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one.
const DIRECTORY_URL = "https://vidsrc.domains/";
const FALLBACK_DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];

export interface Provider {
  name: string;
  baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  path?: (type: ContentType, id: string) => string;
}

// Active domains sit in the #domains section, each row carrying its URL in a
// data-val copy button.
export function parseActiveDomains(html: string): string[] {
  const start = html.indexOf('id="domains"');
  if (start === -1) return [];
  const end = html.indexOf('id="old"', start);
  const section = html.slice(start, end === -1 ? undefined : end);
  const urls = [...section.matchAll(/data-val="([^"]+)"/g)]
    .map(m => {
      try {
        const origin = new URL(m[1]).origin;
        return /^https?:\/\//.test(origin) ? origin : null;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null);
  return [...new Set(urls)];
}

function toProviders(baseUrls: string[]): Provider[] {
  return baseUrls.map(baseUrl => ({ name: new URL(baseUrl).host, baseUrl }));
}

function buildEmbedUrl(provider: Provider, type: "movie" | "tv", id: string): string {
  return provider.baseUrl + (provider.path ? provider.path(type, id) : `/embed/${type}/${id}`);
}

async function loadProviders(http: HttpClient, cache: Cache<string[]>): Promise<Provider[]> {
  const cached = cache.get("domains");
  if (cached) return toProviders(cached);

  let domains: string[] = [];
  try {
    const res = await http.get(DIRECTORY_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) domains = parseActiveDomains(await res.text());
  } catch {
    // Directory unreachable — fall through to the known-good fallback below.
  }
  if (domains.length) cache.set("domains", domains);
  else cache.set("domains", FALLBACK_DOMAINS, 60_000);
  return toProviders(domains.length ? domains : FALLBACK_DOMAINS);
}

// Tried only after every VidSrc domain fails. TV needs season/episode, default to 1/1.
const VIDFAST: Provider = {
  name: "vidfast.vc",
  baseUrl: "https://vidfast.vc",
  path: (type, id) => (type === "movie" ? `/movie/${id}` : `/tv/${id}/1/1`),
};

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

async function fetchKind(kind: "series" | "movie", id: string, http: HttpClient): Promise<FetchKindResult> {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`;
    const res = await http.get(url, { signal: AbortSignal.timeout(META_TIMEOUT_MS) });
    if (!res.ok) return { meta: null, transient: false };
    const m = (await res.json()).meta;
    if (!m?.name) return { meta: null, transient: false };
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

async function fetchMeta(id: string, http: HttpClient): Promise<{ meta: TitleMeta | null; transient: boolean }> {
  const seriesPromise = fetchKind("series", id, http).then(result => ({ which: "series" as const, result }));
  const moviePromise = fetchKind("movie", id, http).then(result => ({ which: "movie" as const, result }));
  const first = await Promise.race([seriesPromise, moviePromise]);
  if (first.result.meta) return first.result;
  const other = first.which === "series" ? await moviePromise : await seriesPromise;
  return { meta: other.result.meta, transient: first.result.transient || other.result.transient };
}

export async function resolveTitle(id: string, http: HttpClient, cache: Cache<TypeResult>): Promise<TypeResult> {
  const cached = cache.get(id);
  if (cached) return cached;

  const fetched = await fetchMeta(id, http);
  const meta = fetched.meta;
  if (!meta) {
    const fallback = await fetchTVMaze(id, http);
    if (fallback) {
      const result: TypeResult = { ok: true, meta: fallback };
      cache.set(id, result);
      return result;
    }
    const miss: TypeResult = { ok: false, reason: "Metadata not found" };
    if (!fetched.transient) cache.set(id, miss, NEGATIVE_TTL_MS);
    return miss;
  }

  const result: TypeResult = { ok: true, meta };
  cache.set(id, result);
  return result;
}

const TVMAZE_TIMEOUT_MS = 5000;

export async function fetchTVMaze(id: string, http: HttpClient): Promise<TitleMeta | null> {
  try {
    const res = await http.get(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, { signal: AbortSignal.timeout(TVMAZE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const m = await res.json();
    if (typeof m.name !== "string") return null;
    const year = typeof m.premiered === "string" ? m.premiered.slice(0, 4) : undefined;
    const summary = typeof m.summary === "string" ? m.summary.replace(/<[^>]*>/g, "").trim() : undefined;
    return { type: "tv", name: m.name, year, description: summary };
  } catch {
    return null;
  }
}

const PROBE_TIMEOUT_MS = 8000;

async function probeProvider(provider: Provider, type: ContentType, id: string, http: HttpClient) {
  const url = buildEmbedUrl(provider, type, id);
  const res = await http.get(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${provider.name} unavailable`);
  return { url, provider: provider.name };
}

export async function selectStream(args: {
  http: HttpClient;
  type: ContentType;
  id: string;
  exclude: string | undefined;
  providerCache: Cache<string>;
  domainCache: Cache<string[]>;
}): Promise<{ url: string; provider: string } | null> {
  const { http, type, id, exclude, providerCache, domainCache } = args;
  const cacheKey = `${type}:${id}`;
  const providers = await loadProviders(http, domainCache);
  const tiers: Provider[][] = [providers, [VIDFAST]];
  const cachedName = providerCache.get(cacheKey);
  const cached = cachedName ? [...providers, VIDFAST].find(p => p.name === cachedName) : undefined;
  if (cached) tiers.unshift([cached]);

  for (const tier of tiers) {
    const candidates = tier.filter(p => p.name !== exclude);
    if (!candidates.length) continue;
    try {
      const winner = await Promise.any(candidates.map(p => probeProvider(p, type, id, http)));
      providerCache.set(cacheKey, winner.provider);
      return winner;
    } catch {
      // This tier failed — try the next one.
    }
  }
  return null;
}

const MAX_TRACKED_IPS = 10_000;

export function createRateLimiter(windowMs: number, maxAttempts: number, now: () => number = Date.now) {
  const attempts = new Map<string, { count: number; expires: number }>();

  return function isLimited(ip: string): boolean {
    const at = now();
    const entry = attempts.get(ip);
    if (!entry || entry.expires < at) {
      if (attempts.size >= MAX_TRACKED_IPS) {
        for (const [key, e] of attempts) if (e.expires < at) attempts.delete(key);
        if (attempts.size >= MAX_TRACKED_IPS) {
          const oldest = attempts.keys().next().value;
          if (oldest !== undefined) attempts.delete(oldest);
        }
      }
      attempts.set(ip, { count: 1, expires: at + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > maxAttempts;
  };
}

// Accepts a bare IMDB ID or anything containing a full IMDb link.
const IMDB_ID = /tt\d{7,8}(?!\d)/;

export function parseImdbId(input: string): string | null {
  return input.toLowerCase().match(IMDB_ID)?.[0] ?? null;
}

export const JSON_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json",
  "Content-Security-Policy": "default-src 'none'",
  "Cache-Control": "no-store",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function createApiHandler(deps: {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  domainCache: Cache<string[]>;
  isLimited: (ip: string) => boolean;
}) {
  const { http, typeCache, providerCache, domainCache, isLimited } = deps;

  return async function handleApiWatch(req: Request): Promise<Response> {
    if (isLimited(req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown")) {
      return json(429, { error: "Too many requests" });
    }

    const url = new URL(req.url);
    const id = parseImdbId(url.searchParams.get("id") ?? "");
    if (!id) return json(400, { error: "Invalid IMDB ID" });

    const typeResult = await resolveTitle(id, http, typeCache);
    if (!typeResult.ok) return json(502, { error: "Failed to detect content type" });

    const exclude = url.searchParams.get("exclude") || undefined;
    const stream = await selectStream({ http, type: typeResult.meta.type, id, exclude, providerCache, domainCache });
    if (!stream) return json(503, { error: "No working providers available" });

    return new Response(JSON.stringify({ id, url: stream.url, provider: stream.provider, ...typeResult.meta }), {
      headers: JSON_HEADERS,
    });
  };
}

// Singletons for the serverless function. Per-instance only;
// use a shared store (e.g. Upstash) if global limits are required.
const typeCache = new Cache<TypeResult>(60 * 60 * 1000);
const providerCache = new Cache<string>(5 * 60 * 1000);
const domainCache = new Cache<string[]>(24 * 60 * 60 * 1000);
const isLimited = createRateLimiter(15 * 60 * 1000, 100);

export const handleApiWatch = createApiHandler({
  http: defaultHttpClient,
  typeCache,
  providerCache,
  domainCache,
  isLimited,
});
