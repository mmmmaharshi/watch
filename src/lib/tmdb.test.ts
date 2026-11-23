import { expect, test } from "bun:test";
import { resolveImdbId } from "./tmdb";
import type { HttpClient } from "./http";

test("identifies itself to Wikidata", async () => {
  let headers: Record<string, string> | undefined;
  const http: HttpClient = {
    get: async (_url, options) => {
      headers = options?.headers;
      return {
        ok: true,
        json: async () => ({ results: { bindings: [] } }),
        text: async () => "",
      };
    },
  };
  await resolveImdbId(http, "movie", "300523");
  expect(headers?.["User-Agent"]).toContain("watch-app");
});
