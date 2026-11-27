import type { Renderer } from "@effect/ui";
import { Schema } from "effect";
import { WatchModel } from "./model";

// A corrupt state script must not crash the boot: parsing and shape checks
// both fall back to a fresh mount, which fetches what the page shows.
const isState = (value: unknown): value is Renderer.State =>
  typeof value === "object" && value !== null;

export const readState = (text: string | undefined): Renderer.State | undefined => {
  if (text === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

// A paste that landed before hydration lives only in the field. The server
// state still holds the empty query, and adopting it would wipe the field
// before the mount reads it. Seed the adopted Model from the live DOM first.
export const seedQuery = (state: Renderer.State, query: string | undefined): Renderer.State => {
  if (query === undefined || query === "") {
    return state;
  }
  const root = state["/Watch"];
  if (!Schema.is(WatchModel)(root)) {
    return state;
  }
  return { ...state, "/Watch": { ...root, query } };
};
