import { expect, test } from "bun:test";
import { clientIp, createRateLimiter, limitResponse } from "./rate-limit";

test("trusts the edge address over a forwarded list", () => {
  const req = new Request("http://x/", {
    headers: { "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "spoofed, 5.6.7.8" },
  });

  expect(clientIp(req)).toBe("9.9.9.9");
});

test("falls back to the last forwarded address, then unknown", () => {
  expect(
    clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "spoofed, 5.6.7.8" } })),
  ).toBe("5.6.7.8");
  expect(clientIp(new Request("http://x/"))).toBe("unknown");
});

test("counts per address and blocks after the limit", () => {
  let now = 0;
  const isLimited = createRateLimiter(1000, 2, () => now);

  expect(isLimited("a")).toBe(false);
  expect(isLimited("a")).toBe(false);
  expect(isLimited("a")).toBe(true);
  expect(isLimited("b")).toBe(false);

  // The window ends on the injected clock, so the address is free again.
  now = 1001;
  expect(isLimited("a")).toBe(false);
});

test("a limited request answers 429 and an allowed one passes", () => {
  const watch = new Request("http://x/api/watch", { method: "POST" });

  expect(limitResponse(watch, () => true)?.status).toBe(429);
  expect(limitResponse(watch, () => false)).toBeNull();
});
