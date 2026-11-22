import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { searchDeps, searchTitles } from "../lib/search";
import { handleWatchRequest, watchDeps } from "../lib/watch";

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
      kind: z.enum(["movie", "tv"]).optional(),
    }),
    handler: async ({ id, exclude, kind }) => handleWatchRequest(watchDeps, { id, exclude, kind }),
  }),
  search: defineAction({
    input: z.object({
      query: z.string().trim().min(1).max(200),
      kind: z.enum(["movie", "tv"]).default("movie"),
    }),
    handler: async ({ query, kind }) => searchTitles(searchDeps, query, kind),
  }),
};
