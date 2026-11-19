import { expect, test } from "bun:test";
import { shareUrl } from "./share";

test("builds the share link for a title", () => {
  expect(shareUrl("https://watch.maharshi.work", "tt0133093")).toBe(
    "https://watch.maharshi.work/#id=tt0133093",
  );
});

test("trims a trailing slash and encodes the id", () => {
  expect(shareUrl("https://watch.maharshi.work/", "tt0133093")).toBe(
    "https://watch.maharshi.work/#id=tt0133093",
  );
  expect(shareUrl("https://watch.maharshi.work", "a b&c")).toBe(
    "https://watch.maharshi.work/#id=a%20b%26c",
  );
});
