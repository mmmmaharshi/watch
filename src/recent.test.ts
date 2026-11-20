import { expect, test } from "bun:test";
import { addRecent, parseRecent } from "./lib/recent";

test("keeps the newest first, without duplicates", () => {
  expect(addRecent([], { id: "tt0000001" })).toEqual([{ id: "tt0000001" }]);
  expect(addRecent([{ id: "tt0000002" }, { id: "tt0000001" }], { id: "tt0000001" })).toEqual([
    { id: "tt0000001" },
    { id: "tt0000002" },
  ]);
});

test("caps the list at five entries", () => {
  let list: Array<{ id: string }> = [];
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    list = addRecent(list, { id });
  }
  expect(list.map((item) => item.id)).toEqual(["f", "e", "d", "c", "b"]);
});

test("falls back to an empty list on missing or junk storage", () => {
  expect(parseRecent(null)).toEqual([]);
  expect(parseRecent("not json")).toEqual([]);
  expect(parseRecent('{"id":"tt0000001"}')).toEqual([]);
  expect(parseRecent('[{"id":"tt0000001"}]')).toEqual([{ id: "tt0000001" }]);
});

test("drops entries without a string id", () => {
  expect(parseRecent('[{"id":1},{"name":"x"},null]')).toEqual([]);
  expect(addRecent([{ id: "tt0000001" }], {} as { id: string })).toEqual([{ id: "tt0000001" }]);
});
