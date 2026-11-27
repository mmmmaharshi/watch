import { BrowserHost, HtmlHydrate } from "@effect/ui/html";
import { Effect } from "effect";
import { makeApp } from "./app";
import type { LookupDeps } from "./lookup-machine";
import { readState, seedQuery } from "./state";
import { SEARCH_FIELD_NAME } from "./watch";

// Called by the host page once the Worker endpoints exist. The effects that
// fetch live in the deps, never in the view.
export const start = (deps: LookupDeps, container: HTMLElement | null) => {
  if (container === null) {
    throw new Error("The #app container is missing.");
  }
  const app = makeApp(deps);
  const text = document.getElementById("state")?.textContent;
  const parsed = readState(text);
  const fieldText = container.querySelector<HTMLInputElement>(
    `input[name="${SEARCH_FIELD_NAME}"]`,
  )?.value;
  const state = parsed === undefined ? undefined : seedQuery(parsed, fieldText);
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
