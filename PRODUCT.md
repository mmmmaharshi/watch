# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A viewer who already has an IMDb or TMDB ID, or a link to either. They are in a hurry and want a playable stream link, not a browsing or discovery experience.

## Product Purpose

Turn a pasted IMDb or TMDB identifier into a working third-party stream link. Success is the shortest path from paste to a usable link, on phone and desktop.

## Positioning

The app does not host video. It reads live provider domains from a directory, probes them for the requested title, and returns the first working embed link. Metadata stays keyless: Cinemeta and TVMaze for IMDb IDs, plus a Wikidata mapping for TMDB IDs.

## Operating Context

A single web page with one input and one action. The result appears in a dialog that shows the title, provider, canonical IMDb ID, and exact stream URL before the user leaves the site.

## Capabilities and Constraints

- Accepts IMDb IDs and links, TMDB IDs, and themoviedb.org movie/TV URLs.
- Bare TMDB numbers can collide across movie and TV ID spaces; the full link is required to disambiguate.
- No accounts, no API keys for metadata or mapping, no server-side user data.
- Provider domains come from vidsrc.domains at runtime; a non-VidSrc provider is currently only VidFast.
- A working provider is judged by an HTTP 200 on its embed URL; no provider documents a status for an unknown title.
- Rate limiting and caches are per serverless instance, not global.

## Brand Commitments

Name: watch. Voice: plain, direct, non-promotional. The app must state that it hosts nothing, links to third parties, and that users should check the URL before playing.

## Evidence on Hand

- Live site: <https://watch.maharshi.work>
- Source contracts in `src/lib/watch.ts`, `src/lib/tmdb.ts`, `src/lib/parse-input.ts`.
- Provider and metadata research in `docs/streaming-providers.md` and `docs/cinemeta-alternatives.md`.
- No customer counts, testimonials, uptime figures, or licensing claims are available. Do not invent them.

## Product Principles

- Speed beats ceremony: one input, one primary action.
- The link is the product; show the exact destination before the user leaves.
- Never imply ownership of third-party streams.
- Keep the path keyless and dependency-light.
- Preserve clarity on small screens.

## Accessibility & Inclusion

No product-specific standard was established. The current page keeps a labelled input, keyboard-accessible dialog, focus return, and reduced-motion support; a redesign must preserve them.
