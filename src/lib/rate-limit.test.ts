import { expect, test } from "bun:test";
import { clientIp, createRateLimiter, isActionRequest, limitResponse } from "./rate-limit";

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

test("routes only action calls to the limiter", () => {
  expect(isActionRequest(new Request("http://x/_actions/watch"))).toBe(true);
  expect(isActionRequest(new Request("http://x/"))).toBe(false);

  const limited = limitResponse(new Request("http://x/_actions/watch"), () => true);
  expect(limited?.status).toBe(429);
  expect(limitResponse(new Request("http://x/_actions/watch"), () => false)).toBeNull();
});
