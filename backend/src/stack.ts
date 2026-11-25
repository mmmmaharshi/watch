import { Stack } from "alchemy/Stack";
import { Worker, providers, state } from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { CacheKv, ProviderListKv } from "./cloudflare";
import RefreshWorker from "./refresh-worker";
import { SITE_DOMAIN, SITE_WORKER, STACK_NAME } from "./resources";

// One program declares the site, the refresh cron, and both KV namespaces.
// The site is a plain Worker over the built assets in dist/client: the platform
// serves the page, the Worker answers /api/*.
const SiteProps = {
  main: "./backend/src/site-worker.ts",
  env: {
    // Shared storage the Effect Providers and Metadata layers read.
    PROVIDERS: ProviderListKv,
    CACHE: CacheKv,
    // Bound as a secret. A deploy without it fails here, by design.
    TMDB_API_KEY: Config.Redacted("TMDB_API_KEY"),
  },
  assets: { directory: "./dist/client" },
};

export default Stack(
  STACK_NAME,
  { providers: providers(), state: state() },
  Effect.gen(function* () {
    const { stage } = yield* Stack;
    // Only prod claims the domain; every other stage stays on workers.dev so a
    // preview cannot take traffic from the live host.
    const site = yield* stage === "prod"
      ? Worker(SITE_WORKER, { ...SiteProps, domain: SITE_DOMAIN })
      : Worker(SITE_WORKER, SiteProps);
    const refresh = yield* RefreshWorker;

    return { url: site.url, refreshUrl: refresh.url, crons: refresh.crons };
  }),
);
