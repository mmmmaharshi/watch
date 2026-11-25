import { bindingsOf, handleSiteRequest } from "./site";

// The Worker entry. Alchemy bundles and deploys this file (async Worker form);
// `wrangler dev` runs the same file locally. Assets are served by the platform
// before this handler, so only /api/* and misses reach it.
export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    return handleSiteRequest(request, bindingsOf(env));
  },
};
