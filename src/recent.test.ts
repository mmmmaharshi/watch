import { addRecent, parseRecent } from "../public/recent.js";

test("keeps the newest first, without duplicates", () => {
  expect(addRecent([], { id: "tt0000001" })).toEqual([{ id: "tt0000001" }]);
  expect(addRecent([{ id: "tt0000002" }, { id: "tt0000001" }], { id: "tt0000001" })).toEqual([
    { id: "tt0000001" },
    { id: "tt0000002" },
  ]);
});

test("caps the list at five entries", () => {
  let list: { id: string }[] = [];
  for (const id of ["a", "b", "c", "d", "e", "f"]) list = addRecent(list, { id });
  expect(list.map(item => item.id)).toEqual(["f", "e", "d", "c", "b"]);
});

test("falls back to an empty list on missing or junk storage", () => {
  expect(parseRecent(null)).toEqual([]);
  expect(parseRecent("not json")).toEqual([]);
  expect(parseRecent('{"id":"tt0000001"}')).toEqual([]);
  expect(parseRecent('[{"id":"tt0000001"}]')).toEqual([{ id: "tt0000001" }]);
});
