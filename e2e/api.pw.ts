import { expect, test } from "@playwright/test";

// The UI tests reach a successful lookup only in the live project, so a broken
// API route or a broken Worker binding has no offline guard. These calls stop
// before any upstream fetch: the watch id fails validation, and the empty
// search fails input validation. Both still build the handler and read the
// bindings.
test("the watch route answers with a product outcome", async ({ request }) => {
  const response = await request.post("/api/watch", { data: { id: "not-an-id" } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: false, reason: "invalid_input" });
});

test("the search route rejects an empty title", async ({ request }) => {
  const response = await request.post("/api/search", { data: { query: "", kind: "movie" } });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: "Send a title." });
});
