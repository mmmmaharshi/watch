import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { siteFor } from "../../backend/src/compose";
import type { SiteBindings } from "../../backend/src/compose";
import type { KvNamespace } from "../../backend/src/kv";
import { isLanguage } from "../lib/languages";
import { KINDS } from "../lib/types";
import type { Mutable } from "../lib/types";

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isKv = (value: unknown): value is KvNamespace =>
  isObject(value) &&
  "get" in value &&
  typeof value.get === "function" &&
  "put" in value &&
  typeof value.put === "function";

// Every binding is optional, so a partial env builds without conditions at the
// call site. The collector is writable; the exported contract stays read-only.
type WiredBindings = Mutable<SiteBindings>;

const bindingsOf = (source: unknown): SiteBindings => {
  if (!isObject(source)) {
    return {};
  }
  const picked: WiredBindings = {};
  if ("CACHE" in source && isKv(source.CACHE)) {
    picked.CACHE = source.CACHE;
  }
  if ("PROVIDERS" in source && isKv(source.PROVIDERS)) {
    picked.PROVIDERS = source.PROVIDERS;
  }
  if ("TMDB_API_KEY" in source) {
    const key = source.TMDB_API_KEY;
    if (typeof key === "string" && key.length > 0) {
      picked.TMDB_API_KEY = key;
    }
  }
  return picked;
};

const kindSchema = z.enum(KINDS);
const languageSchema = z.string().refine(isLanguage, "Choose a listed language");

const DEFAULT_REGION = "IN";

// Cloudflare puts the visitor's country on the request. A local run has no `cf`,
// so the site's own region is the fallback.
const regionOf = (request: Request): string => {
  const cf = (request as Request & { readonly cf?: { readonly country?: unknown } }).cf;
  const country = cf?.country;
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : DEFAULT_REGION;
};

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
      kind: kindSchema.optional(),
    }),
    handler: async ({ id, exclude, kind }, context) => {
      const site = siteFor(bindingsOf(env));
      return Effect.runPromise(
        site.watch({ id, exclude, kind, region: regionOf(context.request) }),
      );
    },
  }),
  search: defineAction({
    input: z.object({
      query: z.string().trim().min(1).max(200),
      kind: kindSchema.default("movie"),
      language: languageSchema.optional(),
    }),
    handler: async ({ query, kind, language }) => {
      const site = siteFor(bindingsOf(env));
      return Effect.runPromise(site.search({ query, kind, language: language ?? "" }));
    },
  }),
};
