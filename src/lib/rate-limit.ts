// The edge answers 429 past this.
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

export const isLimited = createRateLimiter(15 * 60 * 1000, 100);

export function clientIp(req: Request): string {
  // Cloudflare sets cf-connecting-ip at the edge, so a caller cannot forge it.
  const direct = req.headers.get("cf-connecting-ip")?.trim();
  if (direct) {
    return direct;
  }
  // Behind another proxy, the last forwarded entry is the one that proxy
  // appended. Earlier entries are caller-supplied and untrusted.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",");
  const last = forwarded?.at(-1)?.trim();
  return last || "unknown";
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
