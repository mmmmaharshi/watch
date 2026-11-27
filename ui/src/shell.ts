import type { Renderer } from "@effect/ui";
import { HtmlServer } from "@effect/ui/html";
import { SITE_URL } from "../../src/consts";
import { COPY } from "../../src/lib/copy";

const description = COPY.shell.description;

// One graph: the site, and the app it hosts. Search uses the app node for the
// "free web app" result; the site node carries the name and URL.
const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: COPY.wordmark,
      description,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: COPY.wordmark,
      url: `${SITE_URL}/`,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description,
    },
  ],
});

export interface PageAssets {
  readonly css: string;
  readonly js: string;
}

const defaultAssets: PageAssets = { css: "/assets/app.css", js: "/assets/app.js" };

export interface RenderedPage {
  readonly html: string;
  readonly state: Renderer.State;
  readonly head: string;
  readonly htmlAttributes: string;
  readonly bodyAttributes: string;
}

// The static page. The client bundle adopts the rendered view on boot; until
// then the markup is real, so a paste that lands early has somewhere to go.
// The head comes from the components, so the shell cannot drift from it.
export const pageHtml = (
  page: RenderedPage,
  assets: PageAssets = defaultAssets,
): string => `<!DOCTYPE html>
<html ${page.htmlAttributes}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="text-scale" content="scale">
<meta name="theme-color" content="#0a0a0a">
${page.head}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${SITE_URL}/">
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="watch">
<meta property="og:title" content="${COPY.title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${COPY.shell.imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${COPY.title}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">${structuredData}</script>
<link rel="stylesheet" href="${assets.css}">
<script type="module" src="${assets.js}"></script>
</head>
<body ${page.bodyAttributes} class="min-h-dvh bg-canvas px-6 text-ink antialiased">
  <div id="app">${page.html}</div>
  <script type="application/json" id="state">${HtmlServer.serializeState(page.state)}</script>
  <noscript>
    <p class="mt-4 text-sm leading-relaxed text-ink-2">
      ${COPY.shell.noscript}
    </p>
  </noscript>
</body>
</html>
`;
