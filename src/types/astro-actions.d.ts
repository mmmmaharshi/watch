declare module "astro:actions" {
  export const actions: WatchServer;
}

// `astro sync` generates these types into .astro, but tsconfig excludes that
// folder (it holds generated files) and oxlint reads an `any` from it. This
// alias derives the payloads from the server, so there is one contract.
