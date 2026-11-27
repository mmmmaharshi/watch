import { describe, expect, test } from "vitest";
import { initModel } from "../src/model";
import { readState, seedQuery } from "../src/state";

const page = () => ({ "/Watch": initModel() });

describe("the boot state", () => {
  test("a missing script is no state", () => {
    expect(readState(undefined)).toBeUndefined();
  });

  test("a corrupt script is no state, not a crash", () => {
    expect(readState('{"a":')).toBeUndefined();
    expect(readState("null")).toBeUndefined();
  });

  test("a valid script is adopted", () => {
    expect(readState(JSON.stringify(page()))).toEqual(page());
  });

  test("a paste before hydration wins over the server query", () => {
    const state = page();
    expect(seedQuery(state, "tt0133093")["/Watch"]).toMatchObject({ query: "tt0133093" });
  });

  test("an empty field leaves the server state alone", () => {
    const state = page();
    expect(seedQuery(state, "")).toBe(state);
    expect(seedQuery(state, undefined)).toBe(state);
  });

  test("an unknown root shape is left alone", () => {
    const state = { "/Other": {} };
    expect(seedQuery(state, "tt0133093")).toBe(state);
  });
});
