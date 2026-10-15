import { expect, test } from "bun:test";
import { Cache, createHandler, createRateLimiter, type HttpClient, type TypeResult } from "./server";

const MATRIX = { meta: { name: "The Matrix", year: "1999", imdbRating: "8.7", description: "Neo." } };

// A fake network: exactly one Cinemeta endpoint answers (the guessed kind) and
// exactly the provider named by allowed(). This mirrors how Cinemeta replies.
function makeHandler(allowed: () => string, limited = false, metaKind: "movie" | "series" = "movie") {
  const http: HttpClient = {
    get: async (url) => {
      const isMeta = url.includes("cinemeta");
      const isMetaKind = url.includes(`/meta/${metaKind}/`);
      return {
        ok: isMeta ? isMetaKind : url.includes(allowed()),
        json: async () => (isMetaKind ? MATRIX : {}),
      };
    },
  };
  return createHandler({
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    isLimited: () => limited,
  });
}

test("rejects a malformed IMDB id", async () => {
  const handler = makeHandler(() => "vidsrc.pm");
  for (const bad of ["abc", "tt12345", "0133093"]) {
    const res = await handler(new Request(`http://x/api/watch?id=${bad}`));
    expect(res.status).toBe(400);
  }
});

test("returns a working embed url and metadata for a valid id", async () => {
  const handler = makeHandler(() => "vidsrc.pm");
  const res = await handler(new Request("http://x/api/watch?id=tt0133093"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    url: "https://vidsrc.pm/embed/movie/tt0133093",
    provider: "vidsrc.pm",
    type: "movie",
    name: "The Matrix",
    year: "1999",
    rating: "8.7",
    description: "Neo.",
  });
});

test("builds a tv embed url when the series lookup answers", async () => {
  const handler = makeHandler(() => "vidsrc.pm", false, "series");
  const res = await handler(new Request("http://x/api/watch?id=tt0903747"));
  const body = await res.json();
  expect(body.type).toBe("tv");
  expect(body.url).toBe("https://vidsrc.pm/embed/tv/tt0903747");
});

test("skips the excluded provider and picks the next one", async () => {
  let allowed = "vidsrc.pm";
  const handler = makeHandler(() => allowed);

  const first = await (await handler(new Request("http://x/api/watch?id=tt0133093"))).json();
  expect(first.provider).toBe("vidsrc.pm");

  allowed = "vidlink.pro";
  const second = await (await handler(new Request("http://x/api/watch?id=tt0133093&exclude=vidsrc.pm"))).json();
  expect(second.provider).toBe("vidlink.pro");
});

test("returns 502 when metadata is unavailable", async () => {
  const http: HttpClient = { get: async () => ({ ok: false, json: async () => ({}) }) };
  const handler = createHandler({
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    isLimited: () => false,
  });
  const res = await handler(new Request("http://x/api/watch?id=tt0133093"));
  expect(res.status).toBe(502);
});

test("returns 429 when the limiter blocks the request", async () => {
  const handler = makeHandler(() => "vidsrc.pm", true);
  const res = await handler(new Request("http://x/api/watch?id=tt0133093"));
  expect(res.status).toBe(429);
});

test("rate limiter counts per ip and blocks after the limit", () => {
  const limited = createRateLimiter(60_000, 2);
  expect(limited("1.1.1.1")).toBe(false);
  expect(limited("1.1.1.1")).toBe(false);
  expect(limited("1.1.1.1")).toBe(true);
  expect(limited("2.2.2.2")).toBe(false);
});

test("keys the limiter on the transport address, not a spoofed header", async () => {
  const seen: string[] = [];
  const handler = createHandler({
    http: { get: async () => ({ ok: false, json: async () => ({}) }) },
    typeCache: new Cache<TypeResult>(1),
    providerCache: new Cache(1),
    isLimited: (ip) => {
      seen.push(ip);
      return false;
    },
  });

  await handler(
    new Request("http://x/api/watch?id=tt0133093", { headers: { "x-forwarded-for": "9.9.9.9" } }),
    { requestIP: () => ({ address: "1.2.3.4" }) }
  );
  expect(seen).toEqual(["1.2.3.4"]);

  await handler(new Request("http://x/api/watch?id=tt0133093"), { requestIP: () => null });
  expect(seen[1]).toBe("unknown");
});

test("returns a JSON 404 for unknown routes", async () => {
  const handler = makeHandler(() => "vidsrc.pm");
  const res = await handler(new Request("http://x/nope"));
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not Found" });
});

test("serves the page at /", async () => {
  const handler = makeHandler(() => "vidsrc.pm");
  const res = await handler(new Request("http://x/"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html");
});
