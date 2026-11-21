import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { qrcode } from "vite-plugin-qrcode";
import { SITE_URL } from "./src/consts";

// SSR on Vercel. The page shell is static, /api/watch runs on demand.
// host:true listens on LAN too, so phones reach the dev server.
export default defineConfig({
  site: SITE_URL,
  output: "server",
  adapter: vercel(),
  integrations: [react(), sitemap()],
  server: { host: true },
  devToolbar: { enabled: false },
  vite: {
    plugins: [
      tailwindcss(),
      // Prints a QR for the LAN URL on dev start. Host is on, so a phone can scan it.
      qrcode({ filter: (url) => !url.includes("localhost") }),
    ],
  },
  // CSP hashes let the inline Astro and island scripts run without
  // 'unsafe-inline'. The island also writes style attributes, so those
  // alone keep 'unsafe-inline'.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ],
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
});
