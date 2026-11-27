import { makeLookupDeps } from "./deps";
import { httpTransport } from "../../src/lib/transport";
import { start } from "./entry";

// The page's client entry: one call, two JSON endpoints.
start(makeLookupDeps(httpTransport), document.getElementById("app"));
