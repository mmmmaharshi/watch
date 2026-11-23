import { Effect } from "effect";
import { renderToString } from "foldkit/experimental/server";
import { init } from "./model";
import { view } from "./view";

// The page's static markup. The client runtime replaces it on boot; until
// then the field is real, so a paste that lands before the script runs has
// somewhere to go.
export const render = (): string =>
  Effect.runSync(renderToString({ init: () => ({ model: init() }), view }, { isHydratable: false }))
    .html;
