import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/consts";

// SSR on Vercel. The page shell is static, /api/watch runs on demand.
// host:true listens on LAN too, so phones reach the dev server.
export default defineConfig({
  site: SITE_URL,
  output: "server",
  adapter: vercel(),
  integrations: [sitemap()],
  server: { host: true },
});
