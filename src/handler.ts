// The page and its browser module ship inside the bundle as strings. Vercel's
// bundler (Rolldown) has no loader for .html or any other asset, so the page
// cannot be imported as a file or read from disk at runtime.
import { PAGE, RECENT_JS } from "./page";

// ============================================================================
// HTTP Client — Seam for network operations (testability)
// ============================================================================

interface MetaJson {
  meta?: {
    name?: string;
    year?: string;
    releaseInfo?: string;
    imdbRating?: string;
    description?: string;
  };
}

interface HttpClient {
  get(url: string, options?: { signal?: AbortSignal }): Promise<{
    ok: boolean;
    json: () => Promise<MetaJson>;
    text: () => Promise<string>;
  }>;
}

const defaultHttpClient: HttpClient = {
  get: async (url, options) => {
    const res = await fetch(url, options);
    // Cinemeta is third-party JSON; the shape is validated at the call site.
    return { ok: res.ok, json: () => res.json() as Promise<MetaJson>, text: () => res.text() };
  },
};

// ============================================================================
// Cache — Encapsulated state with TTL
// ============================================================================

class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(private ttl: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry && entry.expires > Date.now()) return entry.value;
    this.store.delete(key);
    return undefined;
  }

  set(key: string, value: T, ttl: number = this.ttl): void {
    this.store.set(key, { value, expires: Date.now() + ttl });
  }
}

// ============================================================================
// Providers — Read the live domain list from the vidsrc.domains directory
// ============================================================================

// VidSrc rotates domains, and a stale hardcoded list fails badly: dead domains
// still answer 200 and get picked ahead of the live one. So read the active
// domains from the directory at runtime, and fall back only if it is down.
const DIRECTORY_URL = "https://vidsrc.domains/";
const FALLBACK_DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];

interface Provider {
  name: string;
  baseUrl: string;
  // Defaults to /embed/{type}/{id}; override for a provider with another shape.
  path?: (type: "movie" | "tv", id: string) => string;
}

// Active domains sit in the #domains section, each row carrying its URL in a
// data-val copy button. This parses third-party HTML, so every URL is validated.
function parseActiveDomains(html: string): string[] {
  const start = html.indexOf('id="domains"');
  if (start === -1) return [];
  const end = html.indexOf('id="old"');
  const section = html.slice(start, end > start ? end : undefined);
  const urls = [...section.matchAll(/data-val="([^"]+)"/g)]
    .map(m => {
      try {
        return new URL(m[1]).origin;
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
  // The directory list is worth caching for a day, but a failure is not: cache it
  // briefly so an outage does not add a 5s lookup to every request.
  if (domains.length) cache.set("domains", domains);
  else cache.set("domains", FALLBACK_DOMAINS, 60_000);
  return toProviders(domains.length ? domains : FALLBACK_DOMAINS);
}

// A separate provider, tried only after every VidSrc domain fails. Its TV route
// needs a season and episode, so default to the first.
const VIDFAST: Provider = {
  name: "vidfast.vc",
  baseUrl: "https://vidfast.vc",
  path: (type, id) => (type === "movie" ? `/movie/${id}` : `/tv/${id}/1/1`),
};

// ============================================================================
// Metadata — Cinemeta lookup (movies + series, no key, IMDB IDs)
// ============================================================================

interface TitleMeta {
  type: "movie" | "tv";
  name: string;
  year?: string;
  rating?: string;
  description?: string;
}

type TypeResult =
  | { ok: true; meta: TitleMeta }
  | { ok: false; reason: string };

async function fetchMeta(id: string, http: HttpClient): Promise<TitleMeta | null> {
  for (const kind of ["series", "movie"] as const) {
    try {
      const res = await http.get(`https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const m = (await res.json()).meta;
      if (!m?.name) continue;
      return {
        type: kind === "series" ? "tv" : "movie",
        name: m.name,
        year: m.year || m.releaseInfo,
        rating: m.imdbRating,
        description: m.description,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function detectType(id: string, http: HttpClient, cache: Cache<TypeResult>): Promise<TypeResult> {
  const cached = cache.get(id);
  if (cached) return cached;

  const meta = await fetchMeta(id, http);
  if (!meta) return { ok: false, reason: "Metadata not found" };

  const result: TypeResult = { ok: true, meta };
  cache.set(id, result);
  return result;
}

// ============================================================================
// Provider Selection — With caching and exclusion
// ============================================================================

async function getWorkingEmbedUrl(
  providers: Provider[],
  fallback: Provider[],
  type: "movie" | "tv",
  id: string,
  exclude: string | undefined,
  http: HttpClient,
  cache: Cache<string>
): Promise<{ url: string; provider: string } | null> {
  const cacheKey = `${type}:${id}`;
  const cached = cache.get(cacheKey);
  const all = [...providers, ...fallback];
  if (cached && cached !== exclude) {
    const provider = all.find(p => p.name === cached);
    if (provider) {
      return { url: buildEmbedUrl(provider, type, id), provider: provider.name };
    }
  }

  const probe = async (provider: Provider) => {
    const url = buildEmbedUrl(provider, type, id);
    const res = await http.get(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${provider.name} unavailable`);
    return { url, provider: provider.name };
  };

  // VidSrc domains first; the fallback tier only if none of them answer.
  for (const tier of [providers, fallback]) {
    const candidates = tier.filter(p => p.name !== exclude);
    if (!candidates.length) continue;
    try {
      const winner = await Promise.any(candidates.map(probe));
      cache.set(cacheKey, winner.provider);
      return winner;
    } catch {
      // This tier failed — try the next one.
    }
  }
  return null;
}

// ============================================================================
// Rate Limiter — Encapsulated state
// ============================================================================

const MAX_TRACKED_IPS = 10_000;

function createRateLimiter(windowMs: number, maxAttempts: number) {
  const attempts = new Map<string, { count: number; expires: number }>();

  return function isLimited(ip: string): boolean {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.expires < now) {
      if (attempts.size >= MAX_TRACKED_IPS) {
        for (const [key, e] of attempts) if (e.expires < now) attempts.delete(key);
        const oldest = attempts.keys().next().value;
        if (oldest !== undefined) attempts.delete(oldest);
      }
      attempts.set(ip, { count: 1, expires: now + windowMs });
      return false;
    }
    entry.count++;
    return entry.count > maxAttempts;
  };
}

// ============================================================================
// Security Headers — Single source of truth
// ============================================================================

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "no-referrer",
};

const JSON_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "Content-Type": "application/json",
  "Content-Security-Policy": "default-src 'none'",
  "Cache-Control": "no-store",
};

const HTML_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "Content-Type": "text/html",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'",
};

const JS_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "Content-Type": "text/javascript",
};

// ============================================================================
// Route Handler — Pure function, testable without server
// ============================================================================

// Accepts a bare IMDB ID or anything containing a full IMDb link, and returns
// the canonical ID. The lookahead rejects a longer digit run, so "tt123456789"
// is not silently truncated into a valid-looking ID.
const IMDB_ID = /tt\d{7,8}(?!\d)/;

function parseImdbId(input: string): string | null {
  return input.toLowerCase().match(IMDB_ID)?.[0] ?? null;
}

interface RequestServer {
  requestIP(req: Request): { address: string } | null;
}

// The transport address is authoritative. x-forwarded-for is only a fallback:
// Vercel overwrites it, but a bare server would trust a client-supplied value.
function clientIpFor(req: Request, server?: RequestServer): string {
  return server?.requestIP(req)?.address ?? req.headers.get("x-forwarded-for") ?? "unknown";
}

function createHandler(deps: {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  domainCache: Cache<string[]>;
  isLimited: (ip: string) => boolean;
}) {
  const { http, typeCache, providerCache, domainCache, isLimited } = deps;

  return async function handleRequest(req: Request, server?: RequestServer): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/watch") {
      if (isLimited(clientIpFor(req, server))) {
        return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: JSON_HEADERS });
      }

      const id = parseImdbId(url.searchParams.get("id") ?? "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Invalid IMDB ID" }), { status: 400, headers: JSON_HEADERS });
      }

      const typeResult = await detectType(id, http, typeCache);
      if (!typeResult.ok) {
        return new Response(JSON.stringify({ error: "Failed to detect content type" }), { status: 502, headers: JSON_HEADERS });
      }

      const exclude = url.searchParams.get("exclude") || undefined;
      const providers = await loadProviders(http, domainCache);
      const stream = await getWorkingEmbedUrl(providers, [VIDFAST], typeResult.meta.type, id, exclude, http, providerCache);
      if (!stream) {
        return new Response(JSON.stringify({ error: "No working providers available" }), { status: 503, headers: JSON_HEADERS });
      }

      return new Response(
        JSON.stringify({ id, url: stream.url, provider: stream.provider, ...typeResult.meta }),
        { headers: JSON_HEADERS }
      );
    }

    if (url.pathname === "/") {
      return new Response(PAGE, { headers: HTML_HEADERS });
    }

    if (url.pathname === "/recent.js") {
      return new Response(RECENT_JS, { headers: JS_HEADERS });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: JSON_HEADERS });
  };
}

// ============================================================================
// Singletons — One handler for the process
// ============================================================================

const typeCache = new Cache<TypeResult>(60 * 60 * 1000);
const providerCache = new Cache<string>(5 * 60 * 1000);
// The domain list changes as VidSrc rotates hosts; refresh daily.
const domainCache = new Cache<string[]>(24 * 60 * 60 * 1000);
const isLimited = createRateLimiter(15 * 60 * 1000, 100);

// The entrypoint is server.ts at the repository root, which is the only file
// that calls Bun.serve. Nothing under test imports this `handler`, so no port
// opens during tests.
const handler = createHandler({
  http: defaultHttpClient,
  typeCache,
  providerCache,
  domainCache,
  isLimited,
});

export { handler, createHandler, createRateLimiter, parseActiveDomains, parseImdbId, Cache };
export type { HttpClient, TitleMeta, TypeResult };
