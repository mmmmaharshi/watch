import { assert, describe, it } from "@effect/vitest";
import { handleSiteRequest } from "../src/site";

const request = (path: string, init: RequestInit = {}): Request =>
  new Request(`https://watch.test${path}`, init);

const post = (ip: string): Request =>
  request("/api/watch", {
    method: "POST",
    headers: { "cf-connecting-ip": ip, "content-type": "application/json" },
    body: "{}",
  });

describe("the site route", () => {
  it("answers a path outside /api with 404", async () => {
    const response = await handleSiteRequest(request("/wat"), {});

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(await response.json(), { error: "Not found" });
  });

  it("answers a non-POST with 405, and a GET never spends the budget", async () => {
    const ip = "203.0.113.7";
    for (let attempt = 0; attempt < 101; attempt++) {
      const response = await handleSiteRequest(
        request("/api/watch", { headers: { "cf-connecting-ip": ip } }),
        {},
      );
      assert.strictEqual(response.status, 405);
    }
  });

  it("answers 400 for a body that is not a request, then 429 past the limit", async () => {
    const ip = "203.0.113.8";
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await handleSiteRequest(post(ip), {});
      assert.strictEqual(response.status, 400);
    }

    const limited = await handleSiteRequest(post(ip), {});
    assert.strictEqual(limited.status, 429);
    assert.deepStrictEqual(await limited.json(), { error: "Too many requests" });
  });
});
