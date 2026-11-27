import { Component } from "@effect/ui";
import { HtmlServer } from "@effect/ui/html";
import { Effect, Layer } from "effect";
import { makeLookupDeps } from "./deps";
import { httpTransport } from "../../src/lib/transport";
import { AdvanceLookup, AwaitLookupSettle, lookupEngineLayer } from "./commands";
import { WatchNoDeps } from "./watch";

// The page's static markup, rendered at build time. The client adopts it on
// boot; until then the markup is real, so a paste that lands early has
// somewhere to go.
export const render = () => {
  const engine = lookupEngineLayer(makeLookupDeps(httpTransport));
  const domain = Layer.mergeAll(AdvanceLookup.layer, AwaitLookupSettle.layer).pipe(
    Layer.provide(engine),
  );
  const app = WatchNoDeps.pipe(Component.provide(domain));
  return Effect.runPromise(HtmlServer.renderToHtml(app, {}));
};
