import { afterEach, expect, test } from "bun:test";
import { httpTransport } from "./transport";
import type { WatchOutcome } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
});

const respond = (status: number, body: unknown) => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  });
};

test("a failed watch outcome on 400 stays a product outcome", async () => {
  const outcome: WatchOutcome = {
    ok: false,
    status: 400,
    reason: "invalid_input",
    error: "Invalid IMDb or TMDB ID",
  };
  respond(400, outcome);

  expect(await httpTransport.watch({ id: "nope" })).toEqual({ data: outcome });
});

test("a plain error body stays a transport error", async () => {
  respond(500, { error: "boom" });

  expect(await httpTransport.watch({ id: "tt0133093" })).toEqual({
    error: { message: "boom" },
  });
});
