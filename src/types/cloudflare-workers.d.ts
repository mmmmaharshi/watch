// Astro reads Worker bindings from this virtual module at request time.
// The Cloudflare adapter supplies the runtime values; this declaration names
// the two bindings the app reads, so the build has a type for them.
declare module "cloudflare:workers" {
  export const env: {
    readonly CACHE?: unknown;
    readonly PROVIDERS?: unknown;
  };
}
