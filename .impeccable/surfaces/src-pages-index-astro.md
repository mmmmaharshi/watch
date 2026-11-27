---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: []
---

# Surface: watch landing page

Scope: `src/pages/index.astro` and its client module. Visitor mode: Operate.

Audience and job: a viewer already holding an IMDb or TMDB ID or link; they want a working stream link with the fewest clicks. Action: paste, press Find a stream, inspect the result, then leave for the provider. Proof: the exact provider, canonical IMDb ID, and full stream URL are shown before the user leaves. Constraints: keyless metadata, no accounts, no hosted video, third-party warning must stay readable.

Chosen direction: Monochrome Product Canon. Memorable moment: the found link resolves into one quiet, ruled record on a white field — title, IMDb ID, provider, stream URL — with a single black action and no ornament.

Unresolved: none for this surface.

## Direction contract

THESIS: A stream lookup is a plain product screen, not a themed object. The answer is one typographic record on a white field; the ticket metaphor and its costume are refused.

OWN-WORLD: Near-black #0A0A0A ink, paper #FAFAFA field, gray #6B6B6B secondary, hairline #E4E4E4 rules, white #FFFFFF surfaces. One workhorse grotesk at every role, no second display face. Generous margins, one real type scale, and a single ink-black primary action. Recognizable with all content removed by its centered column, thin rules, and strict monochrome.

STORY: The visitor pastes an ID, presses Find a stream, and reads one clean record: title, IMDb ID, provider, and full stream URL. The black action is the only emphasis; the link is the product. A quiet line at the foot states that the app hosts nothing.

FIRST VIEWPORT: Paper-white field, one centered 720px column. Small "watch" wordmark, one bordered input and one black Find a stream button, a short hint, then the result card: the movie title as the lead line with year and rating beneath, ruled rows for IMDb / Provider / Stream URL, and Cancel / Watch. Safety note at the foot, quiet and readable. On phone the column fills the width in the same order.

FORM: Monochrome Product Canon, safer re-roll grounded card 1 of 2, seed:7a0f6ff53762f44b.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
