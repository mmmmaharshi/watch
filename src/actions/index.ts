import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { handleWatchRequest, watchDeps } from "../lib/watch";
import { searchDeps, searchTitles } from "../lib/search";

export const server = {
  watch: defineAction({
    input: z.object({
      id: z.string(),
      exclude: z.string().optional(),
    }),
    handler: async ({ id, exclude }) => {
      const out = await handleWatchRequest(watchDeps, { id, exclude });
      if (!out.ok) {
        throw new ActionError({
          code: out.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: out.error,
        });
      }
      return out.result;
    },
  }),
  search: defineAction({
    input: z.object({ query: z.string().trim().min(1).max(200) }),
    handler: async ({ query }) => {
      const out = await searchTitles(searchDeps, query);
      if (!out.ok) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Title search failed. Try an ID.",
        });
      }
      return { candidates: out.candidates };
    },
  }),
};
