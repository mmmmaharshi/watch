const TYPE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const PROVIDER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // requests per window

const typeCache = new Map<string, { type: "movie" | "tv"; expires: number }>();
const providerCache = new Map<string, { provider: string; expires: number }>();
const rateLimit = new Map<string, { count: number; expires: number }>();

const IMDB_ID_PATTERN = /^tt\d{7,8}$/;
const ALLOWED_HOSTS = new Set([
  "vidsrc.pm",
  "vidsrc.to",
  "vidsrc.in",
  "www.2embed.cc",
  "multiembed.mov",
  "vidlink.pro",
]);

const EMBED_PROVIDERS = [
  { name: "vidsrc.pm", movie: (id: string) => `https://vidsrc.pm/embed/movie/${id}`, tv: (id: string, s: number = 1, e: number = 1) => `https://vidsrc.pm/embed/tv/${id}/${s}/${e}` },
  { name: "vidsrc.to", movie: (id: string) => `https://vidsrc.to/embed/movie/${id}`, tv: (id: string, s: number = 1, e: number = 1) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { name: "vidsrc.in", movie: (id: string) => `https://vidsrc.in/embed/movie/${id}`, tv: (id: string, s: number = 1, e: number = 1) => `https://vidsrc.in/embed/tv/${id}/${s}/${e}` },
  { name: "2embed.cc", movie: (id: string) => `https://www.2embed.cc/embed/movie/${id}`, tv: (id: string, s: number = 1, e: number = 1) => `https://www.2embed.cc/embed/tv/${id}/${s}/${e}` },
  { name: "multiembed.mov", movie: (id: string) => `https://multiembed.mov/?video_id=${id}&tmdb=1`, tv: (id: string, s: number = 1, e: number = 1) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
  { name: "vidlink.pro", movie: (id: string) => `https://vidlink.pro/movie/${id}`, tv: (id: string, s: number = 1, e: number = 1) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
];

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.expires < now) {
    rateLimit.set(ip, { count: 1, expires: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function isValidEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'",
    "Cache-Control": "no-store",
  };
}

async function detectType(id: string): Promise<"movie" | "tv"> {
  const cached = typeCache.get(id);
  if (cached && cached.expires > Date.now()) {
    return cached.type;
  }
  try {
    const res = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, {
      signal: AbortSignal.timeout(5000),
    });
    const type = res.ok ? "tv" : "movie";
    typeCache.set(id, { type, expires: Date.now() + TYPE_CACHE_TTL });
    return type;
  } catch {
    return "movie";
  }
}

async function verifyEmbedUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getWorkingEmbedUrl(type: "movie" | "tv", id: string): Promise<{ url: string; provider: string } | null> {
  const cacheKey = `${type}:${id}`;
  const cached = providerCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const provider = EMBED_PROVIDERS.find(p => p.name === cached.provider);
    if (provider) {
      const url = type === "tv" ? provider.tv(id) : provider.movie(id);
      if (isValidEmbedUrl(url)) {
        return { url, provider: cached.provider };
      }
    }
  }
  for (const provider of EMBED_PROVIDERS) {
    const embedUrl = type === "tv" ? provider.tv(id) : provider.movie(id);
    if (!isValidEmbedUrl(embedUrl)) continue;
    if (await verifyEmbedUrl(embedUrl)) {
      providerCache.set(cacheKey, { provider: provider.name, expires: Date.now() + PROVIDER_CACHE_TTL });
      return { url: embedUrl, provider: provider.name };
    }
  }
  return null;
}

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    if (url.pathname === "/api/watch") {
      if (isRateLimited(clientIp)) {
        return new Response(
          JSON.stringify({ error: "Too many requests" }),
          { status: 429, headers: securityHeaders() },
        );
      }

      const id = url.searchParams.get("id")?.trim().toLowerCase() ?? "";
      if (!IMDB_ID_PATTERN.test(id)) {
        return new Response(
          JSON.stringify({ error: "Invalid IMDB ID" }),
          { status: 400, headers: securityHeaders() },
        );
      }

      const type = await detectType(id);
      const result = await getWorkingEmbedUrl(type, id);
      if (!result) {
        return new Response(
          JSON.stringify({ error: "No working providers available" }),
          { status: 503, headers: securityHeaders() },
        );
      }
      return new Response(
        JSON.stringify({ url: result.url, provider: result.provider, type }),
        { headers: securityHeaders() },
      );
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("public/index.html"), {
        headers: {
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    return new Response("Not Found", { status: 404, headers: securityHeaders() });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
