import { expect, test } from "bun:test";

// The criteria are the contract; the tests are the promise they are kept.
// Adding a criterion without a test, or deleting a test that guards one, fails.
const criteria = await Bun.file("docs/agents/acceptance.md").text();
const suite = await Bun.file("e2e/acceptance.pw.ts").text();

const declared = [...criteria.matchAll(/^## (A\d+) /gm)].map((match) => match[1]);
const covered = [...suite.matchAll(/\btest\("(A\d+) /g)].map((match) => match[1]);

test("every acceptance criterion has exactly one test", () => {
  expect([...new Set(declared)].sort()).toEqual([...new Set(covered)].sort());
  expect(covered.length).toBe(new Set(covered).size);
});
