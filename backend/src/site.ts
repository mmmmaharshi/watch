import { Effect, Option, Schema } from "effect";
import { limitResponse } from "../../src/lib/rate-limit";
import type { WatchOutcome } from "../../src/lib/types";
import { Kind } from "../../src/lib/types";
import type { SiteBindings } from "./compose";
import type { WatchInput } from "./compose";
import { siteFor } from "./compose";
import type { KvNamespace } from "./kv";
import type { Mutable } from "../../src/lib/types";

const WatchBody = Schema.Struct({
  id: Schema.String,
  kind: Schema.optionalKey(Kind),
  strictKind: Schema.optionalKey(Schema.Boolean),
  name: Schema.optionalKey(Schema.String),
  year: Schema.optionalKey(Schema.String),
  exclude: Schema.optionalKey(Schema.String),
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isKv = (value: unknown): value is KvNamespace =>
  isObject(value) &&
  "get" in value &&
  typeof value.get === "function" &&
  "put" in value &&
  typeof value.put === "function";

// Every binding is optional: the site runs without KV (memory stores).
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
    const watchInput: Mutable<WatchInput> = { id: input.id };
    if (input.kind !== undefined) {
      watchInput.kind = input.kind;
    }
    if (input.strictKind !== undefined) {
      watchInput.strictKind = input.strictKind;
    }
    if (input.name !== undefined) {
      watchInput.name = input.name;
    }
    if (input.year !== undefined) {
      watchInput.year = input.year;
    }
    if (input.exclude !== undefined) {
      watchInput.exclude = input.exclude;
    }
    const outcome: WatchOutcome = await Effect.runPromise(site.watch(watchInput));
    return json(outcome, outcome.ok ? 200 : outcome.status);
  }

  return json({ error: "Not found" }, 404);
};
