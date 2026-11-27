import { Effect, Option, Schema } from "effect";
import { json } from "../../src/lib/http";
import { limitResponse } from "../../src/lib/rate-limit";
import { LookupInput } from "../../src/lib/types";
import type { Mutable, WatchOutcome } from "../../src/lib/types";
import { siteFor } from "./compose";
import type { Bindings } from "./compose";
import type { KvNamespace } from "./kv";

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isKv = (value: unknown): value is KvNamespace =>
  isObject(value) &&
  "get" in value &&
  typeof value.get === "function" &&
  "put" in value &&
  typeof value.put === "function";

// Every binding is optional: the site runs without KV (memory stores).
export const bindingsOf = (source: unknown): Bindings => {
  if (!isObject(source)) {
    return {};
  }
  const bindings: Mutable<Bindings> = {};
  if ("CACHE" in source && isKv(source.CACHE)) {
    bindings.CACHE = source.CACHE;
  }
  if ("PROVIDERS" in source && isKv(source.PROVIDERS)) {
    bindings.PROVIDERS = source.PROVIDERS;
  }
  return bindings;
};

const decodeBody = <A>(schema: Schema.ConstraintDecoder<A>, text: string): Option.Option<A> =>
  Schema.decodeUnknownOption(Schema.fromJsonString(schema))(text);

export const handleSiteRequest = async (
  request: Request,
  bindings: Bindings,
): Promise<Response> => {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, 404);
  }
  // The method check runs before the limiter, so crawlers and probes cannot
  // spend a caller's budget with GET.
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const limited = limitResponse(request);
  if (limited !== null) {
    return limited;
  }

  const body = await request.text();
  const site = siteFor(bindings);

  if (url.pathname === "/api/watch") {
    const parsed = decodeBody(LookupInput, body);
    if (Option.isNone(parsed)) {
      return json({ error: "Send an IMDb or TMDB id." }, 400);
    }
    const outcome: WatchOutcome = await Effect.runPromise(site.watch(parsed.value));
    return json(outcome, outcome.ok ? 200 : outcome.status);
  }

  return json({ error: "Not found" }, 404);
};
