import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { handlerFor } from "../../backend/src/compose";
import type { Bindings } from "../../backend/src/compose";
import type { KvNamespace } from "../../backend/src/kv";
import { SEARCH_FAILED } from "../lib/messages";
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
interface WiredBindings {
  CACHE?: KvNamespace;
  PROVIDERS?: KvNamespace;
}

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

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
      kind: z.enum(["movie", "tv"]).optional(),
    }),
    handler: async ({ id, exclude, kind }) => {
      const handler = handlerFor(bindingsOf(env));
      return Effect.runPromise(handler.handle({ id, exclude, kind }));
    },
  }),
  search: defineAction({
    input: z.object({
      query: z.string().trim().min(1).max(200),
      kind: z.enum(["movie", "tv"]).default("movie"),
    }),
    handler: async ({ query, kind }) => {
      const outcome = await searchTitles(searchDeps, query, kind);
      return outcome.ok ? outcome : { ok: false as const, error: SEARCH_FAILED };
    },
  }),
};
