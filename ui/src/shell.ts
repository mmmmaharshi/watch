import type { Renderer } from "@effect/ui";
import { HtmlServer } from "@effect/ui/html";
import { SITE_URL } from "../../src/consts";
import { COPY } from "./copy";

const description =
  "Paste an IMDb or TMDB ID or link. Get a working stream link for free. No sign-up, no app.";
// Share cards cut the copy short, so they get the same promise in one line.
const shareDescription = "Paste an IMDb or TMDB ID or link. Get a working stream link for free.";

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
export const pageHtml = (page: RenderedPage): string => `<!DOCTYPE html>
<html ${page.htmlAttributes}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="text-scale" content="scale">
<meta name="theme-color" content="#0a0a0a">
${page.head}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='5 3 19 12 5 21 5 3'/></svg>">
<link rel="canonical" href="${SITE_URL}/">
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="watch">
<meta property="og:title" content="${COPY.title}">
<meta property="og:description" content="${shareDescription}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="watch — search a title or paste an IMDb or TMDB ID to get a stream link.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${COPY.title}">
<meta name="twitter:description" content="${shareDescription}">
<link rel="stylesheet" href="/assets/app.css">
<script type="module" src="/assets/app.js"></script>
</head>
<body ${page.bodyAttributes} class="min-h-dvh bg-canvas px-6 text-ink antialiased">
  <div id="app">${page.html}</div>
  <script type="application/json" id="state">${HtmlServer.serializeState(page.state)}</script>
  <noscript>
    <p class="mt-4 text-sm leading-relaxed text-ink-2">
      This page needs JavaScript to find a stream link.
    </p>
  </noscript>
</body>
</html>
`;
