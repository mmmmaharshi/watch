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
  // No markdown code is rendered anywhere, so highlighting stays off: the
  // default Shiki highlighter uses inline styles, which CSP forbids.
  markdown: { syntaxHighlight: false },
  vite: {
    plugins: [
      tailwindcss(),
      // Prints a QR for the LAN URL on dev start. Host is on, so a phone can scan it.
      qrcode({ filter: (url) => !url.includes("localhost") }),
    ],
  },
  // CSP hashes let the inline Astro and island scripts run without
  // 'unsafe-inline'. Stylesheets stay on style-src-elem ('self' scoped
  // there, not default, so it no longer mixes with the attribute rule);
  // the island writes style attributes, so those alone keep 'unsafe-inline'.
  // React Aria injects one style element at runtime, which no build-time
  // hash can cover, so its hash is pinned. The e2e console guard fails
  // when a library update changes that text.
  // Poster art loads from two metadata hosts: the Cinemeta CDN
  // (images.metahub.space) and TVMaze images (static.tvmaze.com).
  // Everything else stays locked down.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://images.metahub.space https://static.tvmaze.com",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ],
      styleDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "attribute" },
        ],
        hashes: [
          {
            hash: "sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o=",
            kind: "element",
          },
        ],
      },
    },
  },
});
