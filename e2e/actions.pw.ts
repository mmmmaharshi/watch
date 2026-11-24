import { expect, test } from "@playwright/test";

// The UI tests reach a successful lookup only in the live project, so a broken
// action route or a broken Worker binding has no offline guard. These calls
// stop before any upstream fetch: the watch id fails validation, and the empty
// search fails input validation. Both still build the handler and read the
// bindings, which is what broke when Astro v6 moved `env`.
test("the watch action answers with a product outcome", async ({ request }) => {
  const response = await request.post("/_actions/watch", { data: { id: "not-an-id" } });

  expect(response.status()).toBe(200);
  // Actions answer in devalue, so match the payload text, not a parsed object.
  expect(await response.text()).toContain("invalid_input");
});

test("the search action rejects an empty query at the edge", async ({ request }) => {
  const response = await request.post("/_actions/search", { data: { query: "", kind: "movie" } });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ type: "AstroActionInputError" });
});
