import { Component } from "@effect/ui";
import { Layer } from "effect";
import { RunLookup, lookupEngineLayer } from "./commands";
import type { LookupDeps } from "./lookup-machine";
import { WatchNoDeps } from "./watch";

// One wire-up for the server render and the browser: the lookup engine behind
// the command, behind the page.
export const makeApp = (deps: LookupDeps) =>
  WatchNoDeps.pipe(Component.provide(RunLookup.layer.pipe(Layer.provide(lookupEngineLayer(deps)))));
