import { Effect, Option, Schema } from "effect";
import { isLanguage } from "../../src/lib/languages";
import { limitResponse } from "../../src/lib/rate-limit";
import type { SearchInput, SearchOutcome, WatchOutcome } from "../../src/lib/types";
import { Kind } from "../../src/lib/types";
import type { SiteBindings } from "./compose";
import type { WatchInput } from "./compose";
import { siteFor } from "./compose";
import type { KvNamespace } from "./kv";
import type { Mutable } from "../../src/lib/types";

const DEFAULT_REGION = "IN";

const WatchBody = Schema.Struct({
  id: Schema.String,
  kind: Schema.optionalKey(Kind),
  exclude: Schema.optionalKey(Schema.String),
});

const SearchBody = Schema.Struct({
  query: Schema.String,
  kind: Kind,
  language: Schema.optionalKey(Schema.String),
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// Cloudflare puts the visitor's country on the request. A local run has no
// `cf`, so the site's own region is the fallback.
const regionOf = (request: Request): string => {
  const cf = (request as Request & { readonly cf?: { readonly country?: unknown } }).cf;
  const country = cf?.country;
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : DEFAULT_REGION;
};

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isKv = (value: unknown): value is KvNamespace =>
  isObject(value) &&
  "get" in value &&
  typeof value.get === "function" &&
  "put" in value &&
  typeof value.put === "function";

// Every binding is optional: the site runs without KV (memory stores) and
// without the TMDB key (no language filter, no official row).
export const bindingsOf = (source: unknown): SiteBindings => {
  if (!isObject(source)) {
    return {};
  }
  const bindings: Mutable<SiteBindings> = {};
  if ("CACHE" in source && isKv(source.CACHE)) {
    bindings.CACHE = source.CACHE;
  }
  if ("PROVIDERS" in source && isKv(source.PROVIDERS)) {
    bindings.PROVIDERS = source.PROVIDERS;
  }
  if ("TMDB_API_KEY" in source) {
    const key = source.TMDB_API_KEY;
    if (typeof key === "string" && key.length > 0) {
      bindings.TMDB_API_KEY = key;
    }
  }
  return bindings;
};

const decodeBody = <A>(schema: Schema.ConstraintDecoder<A>, text: string): Option.Option<A> =>
  Schema.decodeUnknownOption(Schema.fromJsonString(schema))(text);

export const handleSiteRequest = async (
  request: Request,
  bindings: SiteBindings,
): Promise<Response> => {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, 404);
  }
  const limited = limitResponse(request);
  if (limited !== null) {
    return limited;
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await request.text();
  const site = siteFor(bindings);

  if (url.pathname === "/api/watch") {
    const parsed = decodeBody(WatchBody, body);
    if (Option.isNone(parsed)) {
      return json({ error: "Send an IMDb or TMDB id." }, 400);
    }
    const input = parsed.value;
    const watchInput: Mutable<WatchInput> = { id: input.id, region: regionOf(request) };
    if (input.kind !== undefined) {
      watchInput.kind = input.kind;
    }
    if (input.exclude !== undefined) {
      watchInput.exclude = input.exclude;
    }
    const outcome: WatchOutcome = await Effect.runPromise(site.watch(watchInput));
    return json(outcome, outcome.ok ? 200 : outcome.status);
  }

  if (url.pathname === "/api/search") {
    const parsed = decodeBody(SearchBody, body);
    if (Option.isNone(parsed)) {
      return json({ error: "Send a title." }, 400);
    }
    const input = parsed.value;
    const trimmed = input.query.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      return json({ error: "Send a title." }, 400);
    }
    const language = input.language ?? "";
    if (!isLanguage(language)) {
      return json({ error: "Choose a listed language." }, 400);
    }
    const searchInput: SearchInput = { query: trimmed, kind: input.kind, language };
    const outcome: SearchOutcome = await Effect.runPromise(site.search(searchInput));
    return json(outcome);
  }

  return json({ error: "Not found" }, 404);
};
