import { HtmlServer } from "@effect/ui/html";
import { Effect } from "effect";
import { makeApp } from "./app";
import { makeLookupDeps } from "./deps";
import { httpTransport } from "../../src/lib/transport";

// The page's static markup, rendered at build time. The client adopts it on
// boot; until then the markup is real, so a paste that lands early has
// somewhere to go.
export const render = () =>
  Effect.runPromise(HtmlServer.renderToHtml(makeApp(makeLookupDeps(httpTransport)), {}));
