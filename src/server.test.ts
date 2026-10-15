import {
  Cache,
  createHandler,
  createRateLimiter,
  parseActiveDomains,
  type HttpClient,
  type TypeResult,
} from "./server";

const MATRIX = { meta: { name: "The Matrix", year: "1999", imdbRating: "8.7", description: "Neo." } };
const DIRECTORY = "https://vidsrc.domains/";
const DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];

type HttpReply = Awaited<ReturnType<HttpClient["get"]>>;
type MetaJson = Awaited<ReturnType<HttpReply["json"]>>;

function reply(ok: boolean, json: MetaJson = {}, text = ""): HttpReply {
  return { ok, json: async () => json, text: async () => text };
}

// The directory page shape we parse: active domains carry a data-val URL, old
// ones (in the #old section) must be ignored.
const directoryHtml = (domains: string[]) =>
  `<section id="domains">` +
  domains.map(d => `<button class="chip-copy" data-val="${d}">Copy</button>`).join("") +
  `</section><section id="old"><button data-val="https://vidsrc.me">Copy</button></section>`;

// A fake network: the directory, one Cinemeta endpoint (the guessed kind), and
// exactly the provider named by allowed().
function makeHandler(allowed: () => string, limited = false, metaKind: "movie" | "series" = "movie") {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) return reply(true, {}, directoryHtml(DOMAINS));
      const isMeta = url.includes("cinemeta");
      const isMetaKind = url.includes(`/meta/${metaKind}/`);
      return reply(isMeta ? isMetaKind : url.includes(allowed()), isMetaKind ? MATRIX : {});
    },
  };
  return createHandler({
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<string[]>(60_000),
    isLimited: () => limited,
  });
}

test("rejects a malformed IMDB id", async () => {
  const handler = makeHandler(() => "vidsrc.sh");
  for (const bad of ["abc", "tt12345", "0133093"]) {
    const res = await handler(new Request(`http://x/api/watch?id=${bad}`));
    expect(res.status).toBe(400);
  }
});

test("returns a working embed url and metadata for a valid id", async () => {
  const handler = makeHandler(() => "vidsrc.sh");
  const res = await handler(new Request("http://x/api/watch?id=tt0133093"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    url: "https://vidsrc.sh/embed/movie/tt0133093",
    provider: "vidsrc.sh",
    type: "movie",
    name: "The Matrix",
    year: "1999",
    rating: "8.7",
    description: "Neo.",
  });
});

test("builds a tv embed url when the series lookup answers", async () => {
  const handler = makeHandler(() => "vidsrc.sh", false, "series");
  const res = await handler(new Request("http://x/api/watch?id=tt0903747"));
  const body = await res.json();
  expect(body.type).toBe("tv");
  expect(body.url).toBe("https://vidsrc.sh/embed/tv/tt0903747");
});

test("skips the excluded provider and picks the next one", async () => {
  let allowed = "vidsrc.sh";
  const handler = makeHandler(() => allowed);

  const first = await (await handler(new Request("http://x/api/watch?id=tt0133093"))).json();
  expect(first.provider).toBe("vidsrc.sh");

  allowed = "vidsrc.ir";
  const second = await (await handler(new Request("http://x/api/watch?id=tt0133093&exclude=vidsrc.sh"))).json();
  expect(second.provider).toBe("vidsrc.ir");
});

test("reads active domains from the directory and ignores old ones", () => {
  expect(parseActiveDomains(directoryHtml(DOMAINS))).toEqual(DOMAINS);
  expect(parseActiveDomains("")).toEqual([]);
});

test("falls back to known domains when the directory is unreachable", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) return reply(false);
      const ok = url.includes("cinemeta") ? url.includes("/meta/movie/") : url.includes("vidsrc.sh");
      return reply(ok, url.includes("/meta/movie/") ? MATRIX : {});
    },
  };
  const handler = createHandler({
    http,
    typeCache: new Cache<TypeResult>(1),
    providerCache: new Cache(1),
    domainCache: new Cache<string[]>(1),
    isLimited: () => false,
  });
  const body = await (await handler(new Request("http://x/api/watch?id=tt0133093"))).json();
  expect(body.provider).toBe("vidsrc.sh");
});

test("uses VidFast when every VidSrc domain fails", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) return reply(true, {}, directoryHtml(DOMAINS));
      if (url.includes("cinemeta")) return reply(url.includes("/meta/movie/"), url.includes("/meta/movie/") ? MATRIX : {});
      return reply(url.includes("vidfast.vc")); // only VidFast answers
    },
  };
  const handler = createHandler({
    http,
    typeCache: new Cache<TypeResult>(1),
    providerCache: new Cache(1),
    domainCache: new Cache<string[]>(1),
    isLimited: () => false,
  });
  const body = await (await handler(new Request("http://x/api/watch?id=tt0133093"))).json();
  expect(body.provider).toBe("vidfast.vc");
  expect(body.url).toBe("https://vidfast.vc/movie/tt0133093");
});

test("VidFast TV falls back to season 1 episode 1", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) return reply(true, {}, directoryHtml(DOMAINS));
      if (url.includes("cinemeta")) return reply(url.includes("/meta/series/"), url.includes("/meta/series/") ? MATRIX : {});
      return reply(url.includes("vidfast.vc"));
    },
  };
  const handler = createHandler({
    http,
    typeCache: new Cache<TypeResult>(1),
    providerCache: new Cache(1),
    domainCache: new Cache<string[]>(1),
    isLimited: () => false,
  });
  const body = await (await handler(new Request("http://x/api/watch?id=tt0903747"))).json();
  expect(body.url).toBe("https://vidfast.vc/tv/tt0903747/1/1");
});

test("returns 502 when metadata is unavailable", async () => {
  const handler = createHandler({
    http: { get: async () => reply(false) },
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<string[]>(60_000),
    isLimited: () => false,
  });
  const res = await handler(new Request("http://x/api/watch?id=tt0133093"));
  expect(res.status).toBe(502);
});

test("returns 429 when the limiter blocks the request", async () => {
  const handler = makeHandler(() => "vidsrc.sh", true);
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
    http: { get: async () => reply(false) },
    typeCache: new Cache<TypeResult>(1),
    providerCache: new Cache(1),
    domainCache: new Cache<string[]>(1),
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
  const handler = makeHandler(() => "vidsrc.sh");
  const res = await handler(new Request("http://x/nope"));
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not Found" });
});

test("serves the page at /", async () => {
  const handler = makeHandler(() => "vidsrc.sh");
  const res = await handler(new Request("http://x/"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html");
});
