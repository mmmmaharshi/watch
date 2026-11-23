import { Stack } from "alchemy/Stack";
import { Website, providers, state } from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import { CacheKv, ProviderListKv } from "./cloudflare";
import RefreshWorker from "./refresh-worker";
import { SITE_DOMAIN, SITE_WORKER, STACK_NAME } from "./resources";

// One program declares the site, the refresh cron, and both KV namespaces.
// This is the Alchemy alternative to the Wrangler path in docs/agents/deploy.md.
// It has never been deployed.
const Site = Website.Astro(
  SITE_WORKER,
  Effect.gen(function* () {
    const { stage } = yield* Stack;
    // Only prod claims the domain; every other stage stays on workers.dev so a
    // preview cannot take traffic from the live host.
    const domain = stage === "prod" ? { domain: SITE_DOMAIN } : {};
    return {
      env: {
        // Shared storage the Effect Providers and Metadata layers read.
        PROVIDERS: ProviderListKv,
        CACHE: CacheKv,
      },
      ...domain,
    };
  }),
);

export default Stack(
  STACK_NAME,
  { providers: providers(), state: state() },
  Effect.gen(function* () {
    const site = yield* Site;
    const refresh = yield* RefreshWorker;

    return { url: site.url, refreshUrl: refresh.url, crons: refresh.crons };
  }),
);
