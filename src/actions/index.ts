import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { handlerFor } from "../../backend/src/compose";
import type { Bindings } from "../../backend/src/compose";
import type { KvNamespace } from "../../backend/src/kv";
import { isLanguage } from "../lib/languages";
import { LANGUAGE_NEEDS_KEY, SEARCH_FAILED } from "../lib/messages";
import { KINDS } from "../lib/types";
import type { Mutable } from "../lib/types";
import { officialFor, searchByLanguage, tmdbDeps } from "../lib/tmdb";
import { searchDeps, searchTitles } from "../lib/search";

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isKv = (value: unknown): value is KvNamespace =>
  isObject(value) &&
  "get" in value &&
  typeof value.get === "function" &&
  "put" in value &&
  typeof value.put === "function";

// Both bindings are optional, so a partial env builds without conditions at
// the call site. Astro v6 reads Worker bindings from cloudflare:workers.
// The collector is writable; the exported contract stays read-only.
type WiredBindings = Mutable<Bindings>;

const bindingsOf = (source: unknown): Bindings => {
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
  return picked;
};

// A secret, so it is absent in a local run without a .dev.vars file. Every
// feature that needs it degrades to the plain path instead of failing.
const tmdbKeyOf = (source: unknown): string | undefined => {
  if (!isObject(source) || !("TMDB_API_KEY" in source)) {
    return undefined;
  }
  const value = source.TMDB_API_KEY;
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
      const handler = handlerFor(bindingsOf(env));
      const outcome = await Effect.runPromise(handler.handle({ id, exclude, kind }));
      const key = tmdbKeyOf(env);
      if (!outcome.ok || key === undefined) {
        return outcome;
      }
      // Official availability is extra: a TMDB miss leaves the result unchanged.
      const official = await officialFor(
        tmdbDeps(key),
        outcome.result.id,
        outcome.result.type,
        regionOf(context.request),
      );
      return official === null
        ? outcome
        : { ok: true as const, result: { ...outcome.result, official } };
    },
  }),
  search: defineAction({
    input: z.object({
      query: z.string().trim().min(1).max(200),
      kind: kindSchema.default("movie"),
      language: languageSchema.optional(),
    }),
    handler: async ({ query, kind, language }) => {
      const chosen = language ?? "";
      if (chosen === "") {
        return searchTitles(searchDeps, query, kind);
      }
      const key = tmdbKeyOf(env);
      if (key === undefined) {
        return { ok: false as const, error: LANGUAGE_NEEDS_KEY };
      }
      const candidates = await searchByLanguage(tmdbDeps(key), query, kind, chosen);
      // A failed search must not look like "no such title".
      return candidates === null
        ? { ok: false as const, error: SEARCH_FAILED }
        : { ok: true as const, candidates };
    },
  }),
};
