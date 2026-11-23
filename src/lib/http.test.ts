import { expect, test } from "bun:test";
import { Cache } from "./http";

test("caps the cache by evicting the oldest entry", () => {
  const cache = new Cache<string>(60_000, 2);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("c", "3");
  expect(cache.get("a")).toBe(undefined);
  expect(cache.get("c")).toBe("3");
});

test("expired entries read as missing", () => {
  const cache = new Cache<string>(-1);
  cache.set("a", "1");
  expect(cache.get("a")).toBe(undefined);
});
