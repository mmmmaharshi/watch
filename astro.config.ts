import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { qrcode } from "vite-plugin-qrcode";
import { SITE_URL } from "./src/consts";

// Server-rendered on Cloudflare Workers. The page shell prerenders, the
// lookup action runs on demand. host:true listens on LAN too, so phones
// reach the dev server.
export default defineConfig({
  site: SITE_URL,
  output: "server",
  adapter: cloudflare(),
  integrations: [sitemap()],
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
  // CSP hashes let the inline Astro scripts run without 'unsafe-inline'.
  // Stylesheets stay on style-src-elem ('self' scoped there, not default, so
  // it no longer mixes with the attribute rule); the dialog sets style
  // attributes, so style-src-attr alone keeps 'unsafe-inline'. The second
  // style hash is pinned for a runtime-injected style element, which no
  // build-time hash can cover; the e2e console guard fails when a library
  // update changes that text.
  // Poster art loads from two metadata hosts: the Cinemeta CDN
  // (images.metahub.space) and TVMaze images (static.tvmaze.com).
  // Everything else stays locked down.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.metahub.space https://static.tvmaze.com",
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
