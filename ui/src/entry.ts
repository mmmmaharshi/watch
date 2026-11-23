import { Runtime } from "foldkit";
import type { LookupDeps } from "../../backend/src/lookup-machine";
import { lookupEngineLayer } from "./commands";
import { Model, init } from "./model";
import { subscriptions } from "./subscriptions";
import { update } from "./update";
import { view, SEARCH_FIELD_NAME } from "./view";

const serverFieldText = (container: HTMLElement | null): string =>
  container?.querySelector<HTMLInputElement>(`input[name="${SEARCH_FIELD_NAME}"]`)?.value ?? "";

// Called by the host page once the Worker endpoints exist (build ticket 50).
// The effects that fetch live in the deps, never in the view.
export const start = (deps: LookupDeps, container: HTMLElement | null) => {
  // The page serves the same view as static markup, so a paste can land in the
  // field before this script runs. The first render replaces that field, so
  // read what it holds now; never wipe what the person already typed.
  const fieldText = serverFieldText(container);
  const application = Runtime.makeApplication({
    Model,
    init: () => ({ model: { ...init(), query: fieldText } }),
    update,
    view,
    subscriptions,
    resources: lookupEngineLayer(deps),
    container,
  });
  Runtime.run(application);
};
