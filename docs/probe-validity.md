# Can the GET probe detect a dead embed?

Question from [issue #8](https://github.com/mmmmaharshi/watch/issues/8).

## Answer

No. The probe treats any HTTP 2xx as a live provider. No primary source gives it a status that
separates a dead embed from a working one. So it measures reachability, not playability.

## Scope of evidence

This is a bounded check. It uses this repo's source, tests, and offline suite. It uses official
provider docs and specs as primary sources. It does not call a live provider API. Direct fetches of
the VidSrc and VidFast doc pages failed in this session (transport error; empty body), as they did
in earlier research [streaming-providers.md:56-60](streaming-providers.md). No probe result from a
live provider is used below.

## What the code assumes

- `probe` sends one GET to the embed URL and throws only when `res.ok` is false
  [providers.ts:110-117](../backend/src/providers.ts).
- `probe` never reads `res.text()` or `res.json()`. It returns the URL and provider name on
  any `ok` response [providers.ts:110-117](../backend/src/providers.ts).
- `defaultHttpClient.get` copies `Response.ok` from `fetch` into the `ok` field
  [http.ts](../src/lib/http.ts).
- `Response.ok` is true only for status 200-299. It says nothing about the response body
  [MDN Response.ok](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok),
  [Fetch spec](https://fetch.spec.whatwg.org/#ref-for-dom-response-ok).
- `selectStream` races the probes with `Effect.raceAll`. The first to resolve wins. A slow
  working provider loses to a fast dead one if both answer 2xx
  [providers.ts](../backend/src/providers.ts).
- A cached provider name is re-probed, but the same `ok`-only check applies
  [providers.ts](../backend/src/providers.ts),
  [providers.test.ts](../backend/test/providers.test.ts).
- The tests encode the assumption. `makeDeps` returns `reply(true)` with an empty body for a
  "working" provider [providers.test.ts](../backend/test/providers.test.ts). The tier test returns
  `reply(true)` for every provider and still expects a winner
  [providers.test.ts](../backend/test/providers.test.ts).

Assumption stated plainly: a 2xx on `/embed/{type}/{id}` means the provider can play that exact ID.

## What primary sources say about unknown IDs and status codes

- The embed provider docs describe URL shape and ID format. They do not state the HTTP status for
  an unknown or expired ID [streaming-providers.md:16-21](streaming-providers.md),
  [streaming-providers.md:66-68](streaming-providers.md).
- Earlier research could not reach the VidSrc and VidFast doc pages directly from this repo
  [streaming-providers.md:56-60](streaming-providers.md). This session got the same transport error
  and empty body. No primary doc was found that defines a "missing title" status.
- A metadata API shows the contrast. TVMaze documents 301 for a matched show, 404 for no match, and
  404 for a missing episode [TVMaze API docs](https://tvmaze.com/api). Status codes can be
  documented. The embed providers simply do not document one.
- The Fetch spec defines `ok` as the 200-299 range only. It gives no content validity signal
  [MDN Response.ok](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok),
  [Fetch spec](https://fetch.spec.whatwg.org/#ref-for-dom-response-ok).

## Does the assumption hold?

No. A 2xx proves that the HTTP layer answered. It does not prove that the embed page holds a
playable stream for the ID. No primary source supplies a status that would make the two cases
different, so the probe has no status-based way to tell them apart
[streaming-providers.md:66-68](streaming-providers.md),
[MDN Response.ok](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok).

Bounded local evidence: the offline suite passes (33 tests, 0 failures)
[providers.test.ts](../backend/test/providers.test.ts). A one-off call to
`selectStream` with a fake HTTP that answers 200 and body `Video not found or removed` returned
`{"url":"https://vidsrc.test/embed/movie/tt9999999","provider":"vidsrc.test"}`. The code accepted
a dead embed because `ok` was true [providers.ts:110-117](../backend/src/providers.ts).

## Consequence for provider selection

- `selectStream` returns the first 2xx provider. A dead embed that answers 200 with an error page
  wins if it answers first. A working provider that answers later loses
  [providers.ts](../backend/src/providers.ts).
- The winner name goes into the stream cache for 5 minutes
  [providers.ts](../backend/src/providers.ts), [providers.ts](../backend/src/providers.ts). The next request
  probes that cached name first [providers.ts](../backend/src/providers.ts). A dead-but-200 provider
  keeps winning.
- The request handler then returns `ok: true` with that URL
  [providers.ts](../backend/src/providers.ts). The user gets an iframe with no playable stream.
- The `503 No working providers available` path runs only when every probe throws
  [providers.ts](../backend/src/providers.ts), [providers.ts](../backend/src/providers.ts). A 200 dead embed
  never triggers it. The API reports success for a dead embed.

## What the ticket forces

Status alone cannot fix this. No provider publishes the status for a missing ID
[streaming-providers.md:66-68](streaming-providers.md). The selection policy must either inspect the
response body for a real player or stop claiming that the probe finds a working provider. This
research did not change the code.
