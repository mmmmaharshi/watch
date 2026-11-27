import { Component } from "@effect/ui";
import type { Renderer } from "@effect/ui";
import { BrowserHost, HtmlHydrate } from "@effect/ui/html";
import { Effect, Layer, Schema } from "effect";
import type { LookupDeps } from "./lookup-machine";
import { AdvanceLookup, AwaitLookupSettle, lookupEngineLayer } from "./commands";
import { WatchModel } from "./model";
import { SEARCH_FIELD_NAME, WatchNoDeps } from "./watch";

// A corrupt state script must not crash the boot. The guard falls back to a
// fresh mount, which fetches what the page shows.
const isState = (value: unknown): value is Renderer.State =>
  typeof value === "object" && value !== null;

// A paste that landed before hydration lives only in the field. The server
// state still holds the empty query, and adopting it would wipe the field
// before the mount reads it. Seed the adopted Model from the live DOM first.
const seedQuery = (state: Renderer.State, query: string | undefined): Renderer.State => {
  if (query === undefined || query === "") {
    return state;
  }
  const root = state["/Watch"];
  if (!Schema.is(WatchModel)(root)) {
    return state;
  }
  return { ...state, "/Watch": { ...root, query } };
};

// Called by the host page once the Worker endpoints exist. The effects that
// fetch live in the deps, never in the view.
export const start = (deps: LookupDeps, container: HTMLElement | null) => {
  if (container === null) {
    throw new Error("The #app container is missing.");
  }
  const engine = lookupEngineLayer(deps);
  const domain = Layer.mergeAll(AdvanceLookup.layer, AwaitLookupSettle.layer).pipe(
    Layer.provide(engine),
  );
  const app = WatchNoDeps.pipe(Component.provide(domain));
  const text = document.getElementById("state")?.textContent;
  const parsed: unknown = text === undefined ? undefined : JSON.parse(text);
  const fieldText = container.querySelector<HTMLInputElement>(
    `input[name="${SEARCH_FIELD_NAME}"]`,
  )?.value;
  const state = isState(parsed) ? seedQuery(parsed, fieldText) : undefined;
  const program = Effect.gen(function* () {
    const root =
      state !== undefined
        ? yield* HtmlHydrate.hydrateEffect(app, {}, container, state)
        : yield* BrowserHost.mountEffect(app, {}, container);
    // The e2e harness waits for this marker. Hydration adopts the server's
    // nodes instead of replacing them, so the marker must wait for adoption.
    yield* root.adopted;
    container.dataset.booted = "true";
    return yield* Effect.never;
  });
  Effect.runFork(Effect.scoped(program));
};
