import { SITE_URL } from "../../src/consts";
import { COPY } from "./copy";

const description =
  "Search a movie or TV show by name, or paste an IMDb or TMDB ID or link. Get a working stream link for free. No sign-up, no app.";
// Share cards cut the copy short, so they get the same promise in one line.
const shareDescription =
  "Search a movie or TV show by name, or paste an IMDb or TMDB ID or link. Get a working stream link for free.";

// The static page. The client bundle replaces the rendered view on boot; until
// then the markup is real, so a paste that lands early has somewhere to go.
export const pageHtml = (view: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="text-scale" content="scale">
<title>${COPY.title}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='5 3 19 12 5 21 5 3'/></svg>">
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
<body class="min-h-dvh bg-white px-6 text-black antialiased">
  <div id="app">${view}</div>
  <noscript>
    <p class="mt-4 text-sm leading-relaxed text-black/64">
      This page needs JavaScript to find a stream link.
    </p>
  </noscript>
</body>
</html>
`;
