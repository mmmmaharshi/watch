import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// SSR on Vercel. The page shell has no dynamic content; /api/watch runs on demand.
export default defineConfig({
  output: "server",
  adapter: vercel(),
});
