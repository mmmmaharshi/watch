import { expect, test } from "bun:test";
import {
  Cache,
  clientIp,
  createRateLimiter,
  fetchTVMaze,
  handleWatchRequest,
  isActionRequest,
  limitResponse,
  originIfHttps,
  parseActiveDomains,
  resolveTitle,
  selectStream,
  unwrapActionResult,
} from "./watch";
import type { HttpClient, TypeResult, WatchDeps } from "./watch";
import { SITE_URL } from "../consts";

const MATRIX = {
  meta: { name: "The Matrix", year: "1999", imdbRating: "8.7", description: "Neo." },
};
const DIRECTORY = "https://vidsrc.domains/";
const FILE_URL = `${SITE_URL}/providers.json`;
const DOMAINS = ["https://vidsrc.sh", "https://vidsrc2.ru", "https://vidsrc.ir"];

// A refresh file as scripts/refresh-providers.ts writes it.
const refreshFile = (domains: Array<string>, updatedAt = new Date().toISOString()) => ({
  updatedAt,
  providers: domains.map((baseUrl) => ({ name: new URL(baseUrl).host, baseUrl })),
});
const STALE_AT = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

const VALID_RESULT = {
  id: "tt38336631",
  url: "https://vidsrc.sh/embed/tv/tt38336631",
  provider: "vidsrc.sh",
  type: "tv" as const,
  name: "The Blue Road",
};

test("unwraps a successful action result", () => {
  expect(unwrapActionResult({ data: VALID_RESULT, error: undefined })).toEqual(VALID_RESULT);
});

test("surfaces an action error message", () => {
  expect(() => unwrapActionResult({ data: undefined, error: { message: "No providers" } })).toThrow(
    "No providers",
  );
});

test("rejects an action result without usable data", () => {
  expect(() => unwrapActionResult({})).toThrow("Something went wrong");
});

type HttpReply = Awaited<ReturnType<HttpClient["get"]>>;
type MetaJson = Awaited<ReturnType<HttpReply["json"]>>;

function reply(ok: boolean, json: MetaJson = {}, text = ""): HttpReply {
  return { ok, json: async () => json, text: async () => text };
}

// The directory page shape we parse: active domains carry a data-val URL, old
// ones (in the #old section) must be ignored.
const directoryHtml = (domains: Array<string>) =>
  `<section id="domains">` +
  domains.map((d) => `<button class="chip-copy" data-val="${d}">Copy</button>`).join("") +
  `</section><section id="old"><button data-val="https://vidsrc.me">Copy</button></section>`;

// A fake network: the directory, one Cinemeta endpoint (the guessed kind), and
// exactly the provider named by allowed().
function makeDeps(allowed: () => string, metaKind: "movie" | "series" = "movie"): WatchDeps {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(DOMAINS));
      }
      const isMeta = url.includes("cinemeta");
      const isMetaKind = url.includes(`/meta/${metaKind}/`);
      return reply(isMeta ? isMetaKind : url.includes(allowed()), isMetaKind ? MATRIX : {});
    },
  };
  return {
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  };
}

function mappedDeps(find: (url: string) => string | null): WatchDeps {
  const http: HttpClient = {
    get: async (url) => {
      if (url.includes("query.wikidata.org")) {
        const imdb = find(url);
        return {
          ok: true,
          json: async () => ({ results: { bindings: imdb ? [{ imdb: { value: imdb } }] : [] } }),
          text: async () => "",
        };
      }
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(DOMAINS));
      }
      if (url.includes("cinemeta")) {
        const tv = url.includes("/meta/series/");
        return reply(true, tv ? { meta: { ...MATRIX.meta, name: "A Show" } } : MATRIX);
      }
      return reply(url.includes("vidsrc.sh"));
    },
  };
  return {
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  };
}

test("maps a TMDB id to an IMDb id before the normal lookup", async () => {
  const out = await handleWatchRequest(
    mappedDeps(() => "tt0133093"),
    { id: "27205" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.id).toBe("tt0133093");
    expect(out.result.url).toBe("https://vidsrc.sh/embed/movie/tt0133093");
  }
});

test("a TMDB TV URL uses the TV property and the TV embed path", async () => {
  const out = await handleWatchRequest(
    mappedDeps((url) => (url.includes("P4983") ? "tt0903747" : null)),
    { id: "https://www.themoviedb.org/tv/1396-breaking-bad" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.id).toBe("tt0903747");
    expect(out.result.url).toBe("https://vidsrc.sh/embed/tv/tt0903747");
  }
});

test("a bare TMDB TV id is found by trying both properties", async () => {
  const out = await handleWatchRequest(
    mappedDeps((url) => (url.includes("P4983") ? "tt0903747" : null)),
    { id: "1396" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.url).toBe("https://vidsrc.sh/embed/tv/tt0903747");
  }
});

test("a bare TMDB id with a selected type skips the ambiguous check", async () => {
  const out = await handleWatchRequest(
    mappedDeps((url) => (url.includes("P4947") ? "tt0133093" : "tt0903747")),
    { id: "27205", kind: "movie" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.id).toBe("tt0133093");
    expect(out.result.url).toBe("https://vidsrc.sh/embed/movie/tt0133093");
  }
});

test("a bare TMDB id that matches both kinds is rejected as ambiguous", async () => {
  const out = await handleWatchRequest(
    mappedDeps((url) => (url.includes("P4983") ? "tt0903747" : "tt0072443")),
    { id: "1396" },
  );
  expect(out.ok).toBe(false);
  if (!out.ok) {
    expect(out.status).toBe(400);
    expect(out.error).toBe("TMDB ID is ambiguous. Use a movie or TV link.");
  }
});

test("rejects a malformed IMDB id", async () => {
  for (const bad of ["abc", "tt12345", "tt123456789"]) {
    const out = await handleWatchRequest(
      makeDeps(() => "vidsrc.sh"),
      { id: bad },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.error).toBe("Invalid IMDb or TMDB ID");
    }
  }
});

test("accepts a full IMDb link and answers with the canonical id", async () => {
  const link = "https://www.imdb.com/title/tt0133093/?ref_=nv_sr_srsg_0";
  const out = await handleWatchRequest(
    makeDeps(() => "vidsrc.sh"),
    { id: link },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.id).toBe("tt0133093");
    expect(out.result.url).toBe("https://vidsrc.sh/embed/movie/tt0133093");
  }
});

test("returns a working embed url and metadata for a valid id", async () => {
  const out = await handleWatchRequest(
    makeDeps(() => "vidsrc.sh"),
    { id: "tt0133093" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result).toEqual({
      id: "tt0133093",
      url: "https://vidsrc.sh/embed/movie/tt0133093",
      provider: "vidsrc.sh",
      type: "movie",
      name: "The Matrix",
      year: "1999",
      rating: "8.7",
      description: "Neo.",
    });
  }
});

test("builds a tv embed url when the series lookup answers", async () => {
  const out = await handleWatchRequest(
    makeDeps(() => "vidsrc.sh", "series"),
    { id: "tt0903747" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.type).toBe("tv");
    expect(out.result.url).toBe("https://vidsrc.sh/embed/tv/tt0903747");
  }
});

test("skips the excluded provider and picks the next one", async () => {
  let allowed = "vidsrc.sh";
  const deps = makeDeps(() => allowed);

  const first = await handleWatchRequest(deps, { id: "tt0133093" });
  expect(first.ok && first.result.provider).toBe("vidsrc.sh");

  allowed = "vidsrc.ir";
  const second = await handleWatchRequest(deps, { id: "tt0133093", exclude: "vidsrc.sh" });
  expect(second.ok && second.result.provider).toBe("vidsrc.ir");
});

test("originIfHttps parses https origins only (trust comes from source, not name)", () => {
  expect(originIfHttps("https://vidsrc.sh/embed/movie/tt0133093")).toBe("https://vidsrc.sh");
  expect(originIfHttps("https://sub.vidlink.pro/movie/tt0133093")).toBe("https://sub.vidlink.pro");
  expect(originIfHttps("https://vidsrc.xyz/")).toBe("https://vidsrc.xyz");
  expect(originIfHttps("https://evil.example.com/embed/movie/tt0133093")).toBe(
    "https://evil.example.com",
  );
  expect(originIfHttps("http://vidsrc.sh/")).toBeNull();
  expect(originIfHttps("https://vidsrc.sh.evil.com/")).toBe("https://vidsrc.sh.evil.com");
  expect(originIfHttps("not a url")).toBeNull();
});

test("reads active domains from the directory and ignores old ones", () => {
  expect(parseActiveDomains(directoryHtml(DOMAINS))).toEqual(DOMAINS);
  expect(parseActiveDomains("")).toEqual([]);
});

test("directory hosts are probed and probe failures fall back to VidFast", async () => {
  let evilProbes = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(["https://evil.example.com"]));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      if (url.includes("vidfast.vc")) {
        return reply(true);
      }
      if (url.includes("evil")) {
        evilProbes++;
      }
      return reply(false);
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidfast.vc");
  // The evil host is touched by one safe GET probe, then dropped. It is
  // never the returned provider.
  expect(evilProbes).toBeGreaterThan(0);
});

test("prefers the refresh file and skips the directory fetch", async () => {
  let directoryCalls = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(true, refreshFile(["https://vidsrc2.ru"]));
      }
      if (url === DIRECTORY) {
        directoryCalls++;
        return reply(true, {}, directoryHtml(["https://vidsrc.sh"]));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc2.ru"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc2.ru");
  expect(directoryCalls).toBe(0);
});

test("falls back to the directory when the refresh file is missing", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(false);
      }
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(DOMAINS));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc.sh"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc.sh");
});

test("re-fetches the directory when the refresh file is stale", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(true, refreshFile(["https://vidsrc2.ru"], STALE_AT));
      }
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(["https://vidsrc.ir"]));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc.ir"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc.ir");
});

test("fetches the directory once and serves later requests from cache", async () => {
  let directoryCalls = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(false);
      }
      if (url === DIRECTORY) {
        directoryCalls++;
        return reply(true, {}, directoryHtml(["https://vidsrc.sh"]));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc.sh"));
    },
  };
  const deps: WatchDeps = {
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  };
  await handleWatchRequest(deps, { id: "tt0133093" });
  await handleWatchRequest(deps, { id: "tt0133093" });
  expect(directoryCalls).toBe(1);
});

test("still uses a refresh file with an unparseable date when the directory is down", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(true, refreshFile(["https://vidsrc2.ru"], "not-a-date"));
      }
      if (url === DIRECTORY) {
        return reply(false);
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc2.ru"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc2.ru");
});

test("still uses a stale refresh file when the directory is down", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(true, refreshFile(["https://vidsrc2.ru"], STALE_AT));
      }
      if (url === DIRECTORY) {
        return reply(false);
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidsrc2.ru"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc2.ru");
});

test("refresh file hosts are probed and failures are skipped", async () => {
  let evilProbes = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url === FILE_URL) {
        return reply(true, refreshFile(["https://evil.example.com", "https://vidsrc.sh"]));
      }
      if (url === DIRECTORY) {
        return reply(false);
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      if (url.includes("evil")) {
        evilProbes++;
      }
      return reply(url.includes("vidsrc.sh"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidsrc.sh");
  // The file is first-party content, so its entries are probed like any
  // other candidate; the failing evil entry is skipped, never returned.
  expect(evilProbes).toBeGreaterThan(0);
});

test("uses only VidFast when the directory is unreachable", async () => {
  let sawVidSrc = false;
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(false);
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      if (url.includes("vidfast.vc")) {
        return reply(true);
      }
      if (url.includes("vidsrc")) {
        sawVidSrc = true;
      }
      return reply(false);
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidfast.vc");
  expect(sawVidSrc).toBe(false);
});

test("uses VidFast when every VidSrc domain fails", async () => {
  const out = await handleWatchRequest(
    makeDeps(() => "vidfast.vc"),
    { id: "tt0133093" },
  );
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.provider).toBe("vidfast.vc");
    expect(out.result.url).toBe("https://vidfast.vc/movie/tt0133093");
  }
});

test("picks VidLink before VidFast when the directory is down", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(false);
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      return reply(url.includes("vidlink.pro"));
    },
  };
  const out = await handleWatchRequest(
    {
      http,
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok && out.result.provider).toBe("vidlink.pro");
  if (out.ok) {
    expect(out.result.url).toBe("https://vidlink.pro/movie/tt0133093");
  }
});

test("VidFast TV falls back to season 1 episode 1", async () => {
  const out = await handleWatchRequest(
    makeDeps(() => "vidfast.vc", "series"),
    { id: "tt0903747" },
  );
  expect(out.ok && out.result.url).toBe("https://vidfast.vc/tv/tt0903747/1/1");
});

test("retries the directory on a later request after an outage", async () => {
  let directoryCalls = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        directoryCalls++;
        return reply(false);
      }
      const ok = url.includes("cinemeta")
        ? url.includes("/meta/movie/")
        : url.includes("vidfast.vc");
      return reply(ok, url.includes("/meta/movie/") ? MATRIX : {});
    },
  };
  const deps: WatchDeps = {
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  };
  await handleWatchRequest(deps, { id: "tt0133093" });
  await handleWatchRequest(deps, { id: "tt0133094" });
  expect(directoryCalls).toBe(2);
});

test("returns 502 when metadata is unavailable", async () => {
  const out = await handleWatchRequest(
    {
      http: { get: async () => reply(false) },
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok).toBe(false);
  if (!out.ok) {
    expect(out.status).toBe(502);
    expect(out.error).toBe("Failed to detect content type");
  }
});

test("answers 429 from the limiter and null when allowed", async () => {
  const limited = limitResponse(new Request("http://x/_actions/watch"), () => true);
  expect(limited?.status).toBe(429);
  expect(await limited?.json()).toEqual({ error: "Too many requests" });
  expect(limitResponse(new Request("http://x/_actions/watch"), () => false)).toBeNull();
});

test("keys the limiter on the last forwarded address, unknown without it", () => {
  expect(
    clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "spoofed, 5.6.7.8" } })),
  ).toBe("5.6.7.8");
  expect(clientIp(new Request("http://x/"))).toBe("unknown");
});

test("routes only action calls to the limiter", () => {
  expect(isActionRequest(new Request("http://x/_actions/watch"))).toBe(true);
  expect(isActionRequest(new Request("http://x/_actions/watch/extra"))).toBe(true);
  expect(isActionRequest(new Request("http://x/"))).toBe(false);
  expect(isActionRequest(new Request("http://x/robots.txt"))).toBe(false);
});

test("rate limiter counts per ip and blocks after the limit", () => {
  const limited = createRateLimiter(60_000, 2);
  expect(limited("1.1.1.1")).toBe(false);
  expect(limited("1.1.1.1")).toBe(false);
  expect(limited("1.1.1.1")).toBe(true);
  expect(limited("2.2.2.2")).toBe(false);
});

test("rate limiter window expires on the injected clock", () => {
  let at = 1000;
  const limited = createRateLimiter(60_000, 1, () => at);
  expect(limited("1.1.1.1")).toBe(false);
  expect(limited("1.1.1.1")).toBe(true);
  at += 60_001;
  expect(limited("1.1.1.1")).toBe(false);
});

test("re-probes a cached provider instead of trusting it blind", async () => {
  let shUp = true;
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(DOMAINS));
      }
      if (url.includes("cinemeta")) {
        return reply(url.includes("/meta/movie/"), MATRIX);
      }
      if (url.includes("vidsrc.sh")) {
        return reply(shUp);
      }
      return reply(url.includes("vidsrc2.ru"));
    },
  };
  const deps: WatchDeps = {
    http,
    typeCache: new Cache<TypeResult>(60_000),
    providerCache: new Cache<string>(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  };
  const first = await handleWatchRequest(deps, { id: "tt0133093" });
  expect(first.ok && first.result.provider).toBe("vidsrc.sh");
  shUp = false;
  const second = await handleWatchRequest(deps, { id: "tt0133093" });
  expect(second.ok && second.result.provider).toBe("vidsrc2.ru");
});

test("caches a metadata miss so a repeat bad id costs nothing", async () => {
  let metaCalls = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url.includes("cinemeta")) {
        metaCalls++;
      }
      return reply(false);
    },
  };
  const typeCache = new Cache<TypeResult>(60_000);
  await resolveTitle("tt9999999", http, typeCache);
  await resolveTitle("tt9999999", http, typeCache);
  expect(metaCalls).toBe(2);
});

test("fetchTVMaze strips HTML and omits rating", async () => {
  const http: HttpClient = {
    get: async () => reply(true, { name: "X", premiered: "2020-05-01", summary: "<b>Y</b>" }),
  };
  const meta = await fetchTVMaze("tt0000001", http);
  expect(meta).toEqual({ type: "tv", name: "X", year: "2020", description: "Y" });
});

test("fetchTVMaze returns null on 404", async () => {
  const http: HttpClient = { get: async () => reply(false) };
  expect(await fetchTVMaze("tt0000001", http)).toBeNull();
});

test("resolveTitle does not cache a transient Cinemeta failure", async () => {
  let calls = 0;
  const http: HttpClient = {
    get: async (url) => {
      if (url.includes("cinemeta")) {
        calls++;
        throw new Error("boom");
      }
      return reply(false);
    },
  };
  const typeCache = new Cache<TypeResult>(60_000);
  const first = await resolveTitle("tt9999999", http, typeCache);
  const second = await resolveTitle("tt9999999", http, typeCache);
  expect(first.ok).toBe(false);
  expect(second.ok).toBe(false);
  // Both calls hit the network because the miss was not cached.
  expect(calls).toBe(4);
});

test("resolveTitle returns movie even when the series endpoint hangs", async () => {
  const http: HttpClient = {
    get: (url) => {
      // Never settles: the movie answer must win the race on its own.
      if (url.includes("/meta/series/")) {
        return new Promise<HttpReply>(() => {});
      }
      if (url.includes("/meta/movie/")) {
        return Promise.resolve(reply(true, MATRIX));
      }
      return Promise.resolve(reply(false));
    },
  };
  const typeCache = new Cache<TypeResult>(60_000);
  const result = await resolveTitle("tt0133093", http, typeCache);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.meta.type).toBe("movie");
  }
});

test("returns 502 when both Cinemeta and TVMaze miss", async () => {
  const out = await handleWatchRequest(
    {
      http: { get: async () => reply(false) },
      typeCache: new Cache<TypeResult>(60_000),
      providerCache: new Cache(60_000),
      domainCache: new Cache<Array<string>>(60_000),
    },
    { id: "tt0133093" },
  );
  expect(out.ok).toBe(false);
  if (!out.ok) {
    expect(out.status).toBe(502);
  }
});

test("selectStream skips the excluded provider across tiers", async () => {
  const http: HttpClient = {
    get: async (url) => {
      if (url === DIRECTORY) {
        return reply(true, {}, directoryHtml(["https://a.vidsrc.sh", "https://b.vidsrc.sh"]));
      }
      return reply(true);
    },
  };
  const winner = await selectStream({
    http,
    type: "movie",
    id: "tt0133093",
    exclude: "a.vidsrc.sh",
    providerCache: new Cache<string>(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  });
  expect(winner?.provider).toBe("b.vidsrc.sh");
});

test("caps the cache by evicting the oldest entry", () => {
  const cache = new Cache<string>(60_000, 2);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("c", "3");
  expect(cache.get("a")).toBe(undefined);
  expect(cache.get("c")).toBe("3");
});

test("aborts losing probes once a winner resolves", async () => {
  const pending = new Map<string, { resolve: (r: HttpReply) => void; signal?: AbortSignal }>();
  const http: HttpClient = {
    get: (url, options) => {
      if (url === DIRECTORY) {
        return Promise.resolve(
          reply(true, {}, directoryHtml(["https://a.vidsrc.sh", "https://b.vidsrc.sh"])),
        );
      }
      if (url === FILE_URL) {
        return Promise.resolve(reply(false));
      }
      return new Promise<HttpReply>((resolve) => {
        pending.set(url, { resolve, signal: options?.signal });
      });
    },
  };
  const winner = selectStream({
    http,
    type: "movie",
    id: "tt0133093",
    exclude: undefined,
    providerCache: new Cache<string>(60_000),
    domainCache: new Cache<Array<string>>(60_000),
  });
  // Drain the microtask chain until both probes are in flight (no timers).
  for (let i = 0; i < 50 && pending.size < 2; i++) {
    await Promise.resolve();
  }
  expect(pending.size).toBe(2);
  pending.get("https://a.vidsrc.sh/embed/movie/tt0133093")!.resolve(reply(true));
  const result = await winner;
  expect(result?.provider).toBe("a.vidsrc.sh");
  expect(pending.get("https://b.vidsrc.sh/embed/movie/tt0133093")!.signal?.aborted).toBe(true);
});

// Astro owns the page now: the shell prerenders to static HTML, so these
// assert on the served contract (tags and endpoints present), not exact copy.
test("the Astro page keeps title, canonical and share tags", async () => {
  const page = await Bun.file("src/pages/index.astro").text();

  expect(page).toContain("<title>");
  expect(page).toContain("</title>");
  expect(page).toContain('rel="canonical"');
  expect(page).toContain("og:image");
  expect(page).toContain("/og.png");
  expect(page).toContain("twitter:card");
  expect(page).toContain("<WatchApp");
  expect(page).toContain("client:load");
});

// The shell is static (CDN), only /api/watch runs on demand. The sitemap is
// generated, not hand-written.
test("the page prerenders and the sitemap is generated", async () => {
  const page = await Bun.file("src/pages/index.astro").text();
  expect(page).toContain("export const prerender = true");

  const pkg = await Bun.file("package.json").json();
  expect(pkg).toMatchObject({ dependencies: { "@astrojs/sitemap": expect.any(String) } });

  const robots = await Bun.file("public/robots.txt").text();
  expect(robots).toContain("Sitemap: https://watch.maharshi.work/sitemap-index.xml");
});
