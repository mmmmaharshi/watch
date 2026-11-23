import { Effect } from "effect";
import { defineAction } from "astro:actions";
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
// the call site.
interface ManagedBindings {
  CACHE?: KvNamespace;
  PROVIDERS?: KvNamespace;
}

// The site Worker binds both namespaces. A local run has no runtime, so the
// composition falls back to in-memory stores.
const bindingsOf = (locals: unknown): Bindings => {
  if (!isObject(locals) || !("runtime" in locals)) {
    return {};
  }
  const { runtime } = locals;
  if (!isObject(runtime) || !("env" in runtime)) {
    return {};
  }
  const { env } = runtime;
  if (!isObject(env)) {
    return {};
  }
  const bindings: ManagedBindings = {};
  if ("CACHE" in env && isKv(env.CACHE)) {
    bindings.CACHE = env.CACHE;
  }
  if ("PROVIDERS" in env && isKv(env.PROVIDERS)) {
    bindings.PROVIDERS = env.PROVIDERS;
  }
  return bindings;
};

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
      kind: z.enum(["movie", "tv"]).optional(),
    }),
    handler: async ({ id, exclude, kind }, context) => {
      const handler = handlerFor(bindingsOf(context.locals));
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
