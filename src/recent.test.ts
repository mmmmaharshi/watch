// The browser is served this exact text from /recent.js, so the test runs the
// same bytes the page does instead of a second copy of the logic.
import { RECENT_JS } from "./page";

interface RecentEntry {
  id: string;
  name?: string;
}

type RecentModule = {
  addRecent: (list: RecentEntry[], entry: RecentEntry) => RecentEntry[];
  parseRecent: (raw: string | null) => RecentEntry[];
};

const { addRecent, parseRecent } = (() => {
  // `^export ` is stripped so the text can run as a function body; the module's
  // only exports are the two at line start. Bun loads a data: URL as a CJS
  // namespace, so importing it directly does not expose named exports.
  return new Function(`${RECENT_JS.replace(/^export /gm, "")}\nreturn { addRecent, parseRecent };`)();
})() as RecentModule;

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
