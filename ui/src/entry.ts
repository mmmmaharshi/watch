import { Runtime } from "foldkit";
import type { LookupDeps } from "../../backend/src/lookup-machine";
import { lookupEngineLayer } from "./commands";
import { Model, init } from "./model";
import { subscriptions } from "./subscriptions";
import { update } from "./update";
import { view } from "./view";

// Called by the host page once the Worker endpoints exist (build ticket 50).
// The effects that fetch live in the deps, never in the view.
export const start = (deps: LookupDeps, container: HTMLElement | null) => {
  const application = Runtime.makeApplication({
    Model,
    init: () => ({ model: init() }),
    update,
    view,
    subscriptions,
    resources: lookupEngineLayer(deps),
    container,
  });
  Runtime.run(application);
};
