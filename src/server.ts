// ============================================================================
// HTTP Client — Seam for network operations (testability)
// ============================================================================

interface HttpClient {
  get(url: string, options?: { signal?: AbortSignal }): Promise<{ ok: boolean; json: () => Promise<any> }>;
  head(url: string, options?: { signal?: AbortSignal }): Promise<{ ok: boolean }>;
}

const defaultHttpClient: HttpClient = {
  get: (url, options) => fetch(url, { ...options, method: "GET" }).then(res => ({ ok: res.ok, json: () => res.json() })),
  head: (url, options) => fetch(url, { ...options, method: "HEAD" }).then(res => ({ ok: res.ok })),
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

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttl });
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// URL Builder — Pure data + pure function (no closures)
// ============================================================================

interface Provider {
  name: string;
  baseUrl: string;
}

const PROVIDERS: Provider[] = [
  { name: "vidsrc.pm", baseUrl: "https://vidsrc.pm" },
  { name: "vidsrc.to", baseUrl: "https://vidsrc.to" },
  { name: "vidsrc.in", baseUrl: "https://vidsrc.in" },
  { name: "2embed.cc", baseUrl: "https://www.2embed.cc" },
  { name: "multiembed.mov", baseUrl: "https://multiembed.mov" },
  { name: "vidlink.pro", baseUrl: "https://vidlink.pro" },
];

function buildEmbedUrl(provider: Provider, type: "movie" | "tv", id: string, season = 1, episode = 1): string {
  if (provider.name === "multiembed.mov") {
    return `${provider.baseUrl}/?video_id=${id}&tmdb=1${type === "tv" ? `&s=${season}&e=${episode}` : ""}`;
  }
  return `${provider.baseUrl}/embed/${type}/${id}${type === "tv" ? `/${season}/${episode}` : ""}`;
}

// ============================================================================
// Type Detection — Explicit error handling with discriminated union
// ============================================================================

type TypeResult =
  | { ok: true; type: "movie" | "tv"; name: string }
  | { ok: false; reason: string };

async function detectType(id: string, http: HttpClient, cache: Cache<TypeResult>): Promise<TypeResult> {
  const cached = cache.get(id);
  if (cached) return cached;

  try {
    const res = await http.get(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const result: TypeResult = { ok: true, type: "tv", name: data.name || "Unknown" };
      cache.set(id, result);
      return result;
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Network error" };
  }

  const result: TypeResult = { ok: true, type: "movie", name: id.toUpperCase() };
  cache.set(id, result);
  return result;
}

// ============================================================================
// Provider Selection — With caching and exclusion
// ============================================================================

interface StreamResult {
  url: string;
  provider: string;
}

async function getWorkingEmbedUrl(
  type: "movie" | "tv",
  id: string,
  exclude: string | undefined,
  http: HttpClient,
  cache: Cache<string>
): Promise<StreamResult | null> {
  const cacheKey = `${type}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached && cached !== exclude) {
    const provider = PROVIDERS.find(p => p.name === cached);
    if (provider) {
      return { url: buildEmbedUrl(provider, type, id), provider: provider.name };
    }
  }

  for (const provider of PROVIDERS) {
    if (provider.name === exclude) continue;
    const url = buildEmbedUrl(provider, type, id);
    const res = await http.head(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      cache.set(cacheKey, provider.name);
      return { url, provider: provider.name };
    }
  }

  return null;
}

// ============================================================================
// Rate Limiter — Encapsulated state
// ============================================================================

class RateLimiter {
  private attempts = new Map<string, { count: number; expires: number }>();

  constructor(
    private windowMs: number,
    private maxAttempts: number
  ) {}

  isLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(ip);
    if (!entry || entry.expires < now) {
      this.attempts.set(ip, { count: 1, expires: now + this.windowMs });
      return false;
    }
    entry.count++;
    return entry.count > this.maxAttempts;
  }
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

// ============================================================================
// Route Handler — Pure function, testable without server
// ============================================================================

const IMDB_ID_PATTERN = /^tt\d{7,8}$/;

interface HandlerDeps {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  rateLimiter: RateLimiter;
}

function createHandler(deps: HandlerDeps) {
  const { http, typeCache, providerCache, rateLimiter } = deps;

  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    if (url.pathname === "/api/watch") {
      if (rateLimiter.isLimited(clientIp)) {
        return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: JSON_HEADERS });
      }

      const id = url.searchParams.get("id")?.trim().toLowerCase() ?? "";
      if (!IMDB_ID_PATTERN.test(id)) {
        return new Response(JSON.stringify({ error: "Invalid IMDB ID" }), { status: 400, headers: JSON_HEADERS });
      }

      const typeResult = await detectType(id, http, typeCache);
      if (!typeResult.ok) {
        return new Response(JSON.stringify({ error: "Failed to detect content type" }), { status: 502, headers: JSON_HEADERS });
      }

      const exclude = url.searchParams.get("exclude") || undefined;
      const stream = await getWorkingEmbedUrl(typeResult.type, id, exclude, http, providerCache);
      if (!stream) {
        return new Response(JSON.stringify({ error: "No working providers available" }), { status: 503, headers: JSON_HEADERS });
      }

      return new Response(
        JSON.stringify({ url: stream.url, provider: stream.provider, type: typeResult.type, name: typeResult.name }),
        { headers: JSON_HEADERS }
      );
    }

    if (url.pathname === "/") {
      const indexPath = new URL("../public/index.html", import.meta.url);
      return new Response(Bun.file(indexPath), { headers: HTML_HEADERS });
    }

    return new Response("Not Found", { status: 404, headers: JSON_HEADERS });
  };
}

// ============================================================================
// Server Bootstrap — Side effects isolated here
// ============================================================================

const typeCache = new Cache<TypeResult>(60 * 60 * 1000);
const providerCache = new Cache<string>(5 * 60 * 1000);
const rateLimiter = new RateLimiter(15 * 60 * 1000, 100);

const handler = createHandler({
  http: defaultHttpClient,
  typeCache,
  providerCache,
  rateLimiter,
});

export { handler, createHandler, buildEmbedUrl, PROVIDERS, Cache, RateLimiter };
export type { HttpClient, TypeResult, StreamResult, HandlerDeps };

// Start server locally (port only applies when running directly, not on Vercel)
import os from "node:os";

const server = Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  fetch: handler,
});
const nets = Object.values(os.networkInterfaces() ?? {}).flat().filter(Boolean) as any[];
const lanIp = nets.find(n => n.family === "IPv4" && !n.internal)?.address ?? "localhost";
console.log(`Local: http://localhost:${server.port}`);
console.log(`LAN: http://${lanIp}:${server.port}`);