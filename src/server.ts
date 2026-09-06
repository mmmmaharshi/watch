// ============================================================================
// HTTP Client — Seam for network operations (testability)
// ============================================================================

interface HttpClient {
  get(url: string, options?: { signal?: AbortSignal }): Promise<{ ok: boolean; json: () => Promise<any> }>;
}

const defaultHttpClient: HttpClient = {
  get: (url, options) => fetch(url, options).then(res => ({ ok: res.ok, json: () => res.json() })),
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

function buildEmbedUrl(provider: Provider, type: "movie" | "tv", id: string): string {
  if (provider.name === "multiembed.mov") {
    return `${provider.baseUrl}/?video_id=${id}&tmdb=1`;
  }
  return `${provider.baseUrl}/embed/${type}/${id}`;
}

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
      const data = await res.json();
      const m = data?.meta;
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

  try {
    const meta = await fetchMeta(id, http);
    if (meta) {
      const result: TypeResult = { ok: true, meta };
      cache.set(id, result);
      return result;
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Network error" };
  }

  const result: TypeResult = { ok: true, meta: { type: "movie", name: id.toUpperCase() } };
  cache.set(id, result);
  return result;
}

// ============================================================================
// Provider Selection — With caching and exclusion
// ============================================================================

async function getWorkingEmbedUrl(
  type: "movie" | "tv",
  id: string,
  exclude: string | undefined,
  http: HttpClient,
  cache: Cache<string>
): Promise<{ url: string; provider: string } | null> {
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
    const res = await http.get(url, { signal: AbortSignal.timeout(8000) });
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

function createRateLimiter(windowMs: number, maxAttempts: number) {
  const attempts = new Map<string, { count: number; expires: number }>();

  return function isLimited(ip: string): boolean {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.expires < now) {
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

// ============================================================================
// Route Handler — Pure function, testable without server
// ============================================================================

const IMDB_ID_PATTERN = /^tt\d{7,8}$/;

function createHandler(deps: {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  isLimited: (ip: string) => boolean;
}) {
  const { http, typeCache, providerCache, isLimited } = deps;

  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    if (url.pathname === "/api/watch") {
      if (isLimited(clientIp)) {
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
      const stream = await getWorkingEmbedUrl(typeResult.meta.type, id, exclude, http, providerCache);
      if (!stream) {
        return new Response(JSON.stringify({ error: "No working providers available" }), { status: 503, headers: JSON_HEADERS });
      }

      return new Response(
        JSON.stringify({ url: stream.url, provider: stream.provider, ...typeResult.meta }),
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
const isLimited = createRateLimiter(15 * 60 * 1000, 100);

const handler = createHandler({
  http: defaultHttpClient,
  typeCache,
  providerCache,
  isLimited,
});

export { handler };

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