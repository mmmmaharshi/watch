import { expect, test } from "@playwright/test";

// The UI tests reach a successful lookup only in the live project, so a broken
// API route or a broken Worker binding has no offline guard. This call stops
// before any upstream fetch: the watch id fails validation. It still builds
// the handler and reads the bindings.
test("the watch route answers a failed lookup with its status", async ({ request }) => {
  const response = await request.post("/api/watch", { data: { id: "not-an-id" } });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, reason: "invalid_input" });
});
