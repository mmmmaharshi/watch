import { expect, test } from "bun:test";
import { parseSharedId, resultMeta, resultTitle, resultType } from "./watch-view";

test("reads the shared id from the query first, then the hash", () => {
  expect(parseSharedId("?id=tt0133093", "#id=tt0241527")).toBe("tt0133093");
  expect(parseSharedId("", "#id=tt0241527")).toBe("tt0241527");
  expect(parseSharedId("", "")).toBe(null);
  expect(parseSharedId("?x=1", "#id=tt0241527")).toBe(null);
});

test("builds the result title, meta line and type label", () => {
  expect(resultTitle({ id: "tt0133093", name: "The Matrix" })).toBe("The Matrix");
  expect(resultTitle({ id: "tt0133093", name: "" })).toBe("TT0133093");
  expect(resultMeta({ year: "1999", rating: "8.7" })).toBe("1999 · IMDb 8.7");
  expect(resultMeta({ year: "1999" })).toBe("1999");
  expect(resultMeta({})).toBe("");
  expect(resultType("tv")).toBe("TV Show");
  expect(resultType("movie")).toBe("Movie");
});
