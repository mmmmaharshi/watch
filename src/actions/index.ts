import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { searchDeps, searchTitles } from "../lib/search";
import { handleWatchRequest, watchDeps } from "../lib/watch";

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
    }),
    handler: async ({ id, exclude }) => handleWatchRequest(watchDeps, { id, exclude }),
  }),
  search: defineAction({
    input: z.object({ query: z.string().trim().min(1).max(200) }),
    handler: async ({ query }) => searchTitles(searchDeps, query),
  }),
};
