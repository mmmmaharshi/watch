# IMDb Type Lookup (Movie vs Series)

Context: the app turns an IMDb ID into `movie` or `tv` before it picks a provider.
Until 2026-11-27, `backend/src/metadata.ts` asked Cinemeta for both `movie` and
`series` in parallel and kept the first answer. That is wrong for IDs where
Cinemeta keeps a wrong "stub" movie record. This note covers only the
movie-vs-series flag. It does not repeat the metadata comparison in
`docs/cinemeta-alternatives.md`.

All requests below ran from a Windows host on 2026-11-27. Values are measured
unless marked "unverified".

## Test IDs and what each source says

| ID        | Title        | IMDb suggestion `qid` | TMDB `find`         | Wikidata `P31`    | OMDb `Type` | TVMaze | Cinemeta movie / series                          |
| --------- | ------------ | --------------------- | ------------------- | ----------------- | ----------- | ------ | ------------------------------------------------ |
| tt2661044 | The 100      | `tvSeries`            | not tested (no key) | television series | not tested  | 301    | "Yellowknife", year `""`, 0 videos / 103 videos  |
| tt0903747 | Breaking Bad | `tvSeries`            | not tested (no key) | television series | not tested  | 301    | "Mirror", year `""`, 0 videos / 67 videos        |
| tt0133093 | The Matrix   | `movie`               | not tested (no key) | film              | not tested  | 404    | "The Matrix", year 1999, 0 videos / empty `name` |
| tt1375666 | Inception    | `movie`               | not tested (no key) | film              | not tested  | 404    | "Inception", year 2010, 0 videos / empty `name`  |

## Comparison

| Candidate                | Key? | Requests for type | Limits                                        | Documented?           | Type signal                                     | Notes                                                |
| ------------------------ | ---- | ----------------- | --------------------------------------------- | --------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| IMDb suggestion endpoint | No   | 1                 | None published                                | No (private)          | `qid`: `movie`, `tvSeries`, `tvMiniSeries`, ... | First-party data. Can change or block without notice |
| IMDb title page JSON-LD  | No   | 1                 | Blocked by AWS WAF                            | No                    | `@type` / `og:type`                             | Not usable from a Worker                             |
| TMDB `find`              | Yes  | 1                 | ~40 req/s, respect 429                        | Yes                   | which result array is non-empty                 | Covers movies, shows, episodes, people               |
| Wikidata SPARQL          | No   | 1                 | 60 s work per 60 s per UA+IP, 5 parallel, 429 | Yes                   | `P31` root type                                 | Community data. Needs a descriptive User-Agent       |
| OMDb                     | Yes  | 1                 | Free key 1,000/day                            | Yes (key page)        | `Type` field                                    | No key, no test. Free cap is low                     |
| TVMaze lookup            | No   | 1                 | 20 calls/10 s per IP, 429                     | Yes                   | 301 = show, 404 = not in TVMaze                 | Series only. 404 does not prove "movie"              |
| Cinemeta                 | No   | 2                 | None published                                | Partial (Stremio SDK) | `videos`, empty `year`                          | Heuristic only. Stubs carry the wrong `type`         |

## 1. IMDb suggestion endpoint — fast, first-party, undocumented

The endpoint is `https://v2.sg.media-imdb.com/suggestion/{first-letter}/{query}.json`
(no official documentation; the host has no `/robots.txt`, measured 404).

Request for `tt2661044`:

```json
{
  "d": [
    {
      "id": "tt2661044",
      "l": "The 100",
      "q": "TV series",
      "qid": "tvSeries",
      "tl": "2014-2020 TV Series",
      "y": 2014,
      "yr": "2014-2020"
    }
  ],
  "q": "tt2661044",
  "v": 1
}
```

The machine field is `qid`. Values seen: `tvSeries`, `tvMiniSeries`,
`tvEpisode`, `movie`, `podcastEpisode`. `q` is the display label, for example
`"TV series"` or `"feature"` for a film. Use `qid`, not `q`.

The response is a search result, not an exact lookup. Two behaviours matter:

- `tt9999999` returns eight other IDs and no exact match. Filter `d[]` by
  `id === "tt..."`, then read `qid`.
- `tt0068646` returns The Godfather first, then a person (`nm...`). The same
  filter removes the person.

Measured values: `tt2661044` -> `tvSeries`, `tt0903747` -> `tvSeries`,
`tt0133093` -> `movie`, `tt1375666` -> `movie`, `tt0185906` (Band of Brothers)
-> `tvMiniSeries`, `tt0959621` (a Breaking Bad episode) -> `tvEpisode`.
Map `tvSeries`, `tvMiniSeries`, and `tvEpisode` to `tv`; map `movie` to `movie`.

Reachability: returns 200 with and without a User-Agent. Responses come from
CloudFront with `X-Cache: Hit` and an `Age` header, so answers are cached.
Measured latency was 0.15-0.38 s, 300-560 bytes per response. No CORS problem
for server-side use. No published rate limit.

Stability: IMDb does not document this endpoint. The only documented IMDb API
is the GraphQL API on AWS Data Exchange, which needs an AWS subscription and
keys (https://developer.imdb.com/documentation/api-documentation/). IMDb's
`robots.txt` says: "Use of any device, tool, or process designed to data mine
or scrape the content using automated means is prohibited without prior
written permission from IMDb" (https://www.imdb.com/robots.txt). The
suggestion host is a separate host with no robots.txt, but the data is still
IMDb data. Treat this endpoint as unsupported: it works today, it may stop
without notice, and it may block datacenter IPs (the Worker case is
unverified).

Verdict: the cheapest correct signal, if an undocumented dependency is
acceptable.

## 2. IMDb title page JSON-LD and `og:type` — blocked, do not use

The plan was to read the schema.org block (`"@type": "Movie"` or `"TVSeries"`)
or `<meta property="og:type">`. IMDb does not serve the page to a server-side
client:

- `curl https://www.imdb.com/title/tt0133093/` -> `403`, 118-byte "403
  Forbidden" body, no User-Agent.
- `curl` with a normal Chrome User-Agent -> `202`, then a 2 KB AWS WAF
  challenge page that needs JavaScript:
  `AwsWafIntegration.getToken()` / "we need to verify that you're not a
  robot".

So a Worker fetch cannot read the JSON-LD or `og:type`. Scraping the page is
also against the robots.txt text quoted above.

The Open Graph values `video.movie` and `video.tv_show` are defined by the
protocol (https://ogp.me/), but I could not verify that IMDb uses them, because
the page is blocked. Unverified.

Verdict: unusable server-side. Do not build on it.

## 3. TMDB `/3/find/{imdb_id}` — one request, needs a key

`GET /3/find/{external_id}?external_source=imdb_id` "will search all objects
(movies, TV shows and people) and return the results in a single response"
(https://developer.themoviedb.org/reference/find-by-id). The same page lists
IMDb as a supported source for Movies, TV Shows, TV Episodes, and People.

The response has `movie_results`, `tv_results`, `tv_episode_results`, and
`tv_season_results` (https://developer.themoviedb.org/reference/find-by-id).
For a movie, `movie_results` is non-empty. For a series, `tv_results` is
non-empty. For an episode ID, `tv_episode_results` is non-empty.

Measured without a key:

```json
{
  "status_code": 7,
  "status_message": "Invalid API key: You must be granted a valid key.",
  "success": false
}
```

Status 401. The docs declare an API key in the `Authorization` header
(https://developer.themoviedb.org/reference/find-by-id).

Limits: the legacy "40 requests every 10 seconds" limit was disabled on
2019-12-16. The current guidance is "somewhere in the 40 requests per second
range" and to respect `429`
(https://developer.themoviedb.org/docs/rate-limiting).

Cost: free for non-commercial use with attribution. The required notice is
"This product uses the TMDB API but is not endorsed or certified by TMDB", and
the TMDB logo must be shown (https://developer.themoviedb.org/docs/faq).
Commercial use needs a licence (same page).

I could not run the four IDs without a key. The per-ID result is therefore
documented, not measured.

Verdict: the most authoritative single request if a key is acceptable. It also
returns the display fields in the same response.

## 4. Wikidata — keyless, documented, one SPARQL request

Wikidata stores the IMDb ID in `P345` ("IMDb ID", identifier with prefix `tt`,
`nm`, `co`, ...) and the item class in `P31` ("instance of")
(https://www.wikidata.org/wiki/Property:P345,
https://www.wikidata.org/wiki/Property:P31).

Relevant `P31` values:

| QID       | Label                     |
| --------- | ------------------------- |
| Q11424    | film                      |
| Q5398426  | television series         |
| Q1259759  | miniseries                |
| Q506240   | television film           |
| Q21191270 | television series episode |

Labels and descriptions were read from the Wikidata API
(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q11424|Q5398426&props=labels|descriptions`).
The pages are https://www.wikidata.org/wiki/Q11424 and
https://www.wikidata.org/wiki/Q5398426.

Query used (one request, returns about 1.5 KB):

```sparql
SELECT ?imdb ?root WHERE {
  VALUES ?imdb { "tt2661044" "tt0903747" "tt0133093" "tt1375666" }
  ?item wdt:P345 ?imdb ; wdt:P31 ?type .
  ?type wdt:P279* ?root .
  VALUES ?root { wd:Q11424 wd:Q5398426 }
}
```

The `P279*` step is needed. Some items use a subclass as `P31`, not the root
class. For example `tt38262097` has `P31` = Q63952888 ("anime television
series"), and `tt0185906` has Q1259759 ("miniseries"). A strict `P31 =
Q5398426` test misses both. With `P279*`, the measured answers were:

```
tt0903747 -> Q5398426 (television series)
tt1375666 -> Q11424    (film)
tt0133093 -> Q11424    (film)
tt2661044 -> Q5398426  (television series)
```

An unknown ID returns HTTP 200 with an empty result set, not an error.

Coverage: a sample of 15 IDs taken from IMDb suggestion results all had a
film/series root. The sample is small, so gaps are still possible. Wikidata is
community-edited; a new or obscure title can be missing or have an odd `P31`.

Limits: 60-second query deadline. One client (User-Agent + IP) gets 60 seconds
of processing time per 60 seconds, 30 error queries per minute, and 5 parallel
queries. Excess gets `429` with `Retry-After`. A descriptive User-Agent is
required and clients that ignore the policy can be blocked
(https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual). The same
page says v1 of the service stays available through June 2027, so plan for the
v2 endpoint later.

Measured latency: 0.40 s, 1.30 s, and 5.75 s on three warm runs of a single-ID
query; 0.8 s for the 7-ID query above; 1.5 s and 3.7 s for the 4-ID and 7-ID
batches. The spread is the main cost. The app's 5 s request timeout is close
to the slow end.

Verdict: the best keyless, documented type oracle. Cost is one extra request
and a slow tail.

## 5. OMDb `?i=tt...` — key, simple, low daily cap

OMDb documents `i` as "A valid IMDb ID (e.g. tt1285016)" and `type` as
`movie, series, episode` (https://www.omdbapi.com/). With no key:

```json
{ "Response": "False", "Error": "No API key provided." }
```

Status 401. A `demo` key also returns 401 ("Invalid API key!").

The free key page says "FREE! (1,000 daily limit)"
(https://www.omdbapi.com/apikey.aspx). The site licence is CC BY-NC 4.0
(https://www.omdbapi.com/).

The response field `Type` is not shown in the static documentation. The docs
render their response examples with JavaScript, and I had no key. So the claim
"the response has `Type: movie|series|episode`" is unverified here. The request
parameter `type` is documented.

Verdict: simple and exact, but needs a key, and 1,000/day is low for a shared
Worker. Use only if a key is already present and volume is small.

## 6. TVMaze `/lookup/shows?imdb=tt...` — series-only, keyless

"If the given ID can be matched, a HTTP 301 redirect to the show's URL will be
returned. Otherwise, a HTTP 404 is sent"
(https://www.tvmaze.com/api). Example in the docs:
`https://api.tvmaze.com/lookup/shows?imdb=tt0944947` (same page).

Measured with redirects off:

```
tt2661044 -> 301, Location: https://api.tvmaze.com/shows/6
tt0903747 -> 301, Location: https://api.tvmaze.com/shows/169
tt0133093 -> 404
tt1375666 -> 404
```

The followed 301 returns the show JSON, including `name`, `premiered`,
`summary`, and `externals.imdb`.

Limits: "at least 20 calls every 10 seconds per IP", `429` on excess, 60-minute
edge cache, data under CC BY-SA
(https://www.tvmaze.com/api).

The 404 is the problem. It means "not a TVMaze show", not "a movie". TVMaze
does not cover every series, so a 404 can be a false movie signal. A 301 is a
strong series signal.

Verdict: good positive check for series. Never use the 404 alone to choose
`movie`.

## 7. Cinemeta — the payload is a heuristic, not a type oracle

Cinemeta is called as
`https://v3-cinemeta.strem.io/meta/{movie|series}/{id}.json`. Measured on
2026-11-27, the host returns `307` to `https://cinemeta-live.strem.io/...`
for some paths. The Worker fetch follows redirects, so this does not break the
app, but the host constant is no longer the final host.

The `meta.type` field only echoes the path. For `tt2661044`, both responses say
`type: "movie"` and `type: "series"`. It does not prove anything.

Signals that did hold on the tested IDs:

- A series record lists episodes in `videos`: 103 for The 100, 67 for Breaking
  Bad, 18 for one 2026 show, 1 for another.
- A stub movie record has an empty `year` and a value in `releaseInfo`:
  `"name":"Yellowknife","type":"movie","year":"","releaseInfo":"2002"`.
- A real movie's series lookup returns an empty `name`.

The stub pattern is not rare. `tt38262097` (a 2026 series) also answers
`movie` with "Millowitsch Theater - Der Etappenhase" (1959), empty `year`,
0 videos. `tt21228028` answers `movie` with "Rice" (1963), empty `year`.

The risk: the fix in `metadata.ts` trusts "a stub has no `year`". A stub with a
year would defeat it. A series with no `videos` plus such a stub would also
defeat it. The "series has episodes" test is the stronger half, because a real
movie's series record has an empty `name`.

Verdict: keep as the data source and as a fast fallback. Do not treat it as
proof of type.

## Recommendation

Ordered by preference for this app. The type check should run only when the
two Cinemeta kinds disagree, or when the winner looks like a stub (series with
no `videos`, or a movie with a year that beat a series record). Cache the
result with the existing 60-second metadata cache; type never changes.

1. **Wikidata SPARQL** (keyless, 1 extra request, no package or key).
   One query with `P345` + `P31/P279*` gives the type for movies, series,
   miniseries, and episodes. It is documented and needs no key. Cost: about
   1.5 KB and 0.4-1.5 s typical, with a 5.75 s tail seen once; send a
   descriptive User-Agent. Use it as the deciding vote when Cinemeta is
   ambiguous. Run it in parallel with the Cinemeta fetches and cap it at about
   2 s, so the slow tail cannot stall the 5 s request budget.

2. **IMDb suggestion** (keyless, 1 extra request, undocumented).
   Cheapest and fastest: about 0.2 s and 300 bytes, and it is first-party data.
   Cost: no documentation, no SLA, possible datacenter-IP blocking, and IMDb's
   robots.txt forbids automated scraping. Use it as a fast probe or as a
   fallback for Wikidata, not as the only source.

3. **TMDB `find`** (key required, 1 request).
   The cleanest answer if a key is acceptable. It is documented, covers both
   kinds in one response, and its limits are far above this app's traffic.
   Cost: a key, attribution text and logo, and one request. Best long-term
   option if the app ever moves to a keyed metadata source.

4. **OMDb** (key required, 1 request).
   Simple, but 1,000 requests/day is low for a shared Worker, and the response
   field is unverified without a key.

5. **TVMaze** (keyless, 1 request).
   Keep it as a positive series check only. A 404 must not select `movie`.

6. **Do not use the IMDb title page or `og:type`.**
   AWS WAF returns 403 or a JavaScript challenge to server-side clients, and
   scraping is prohibited by robots.txt.

If only one change is made: add the Wikidata query as the tie-breaker in
`bothKinds`, behind the existing 1-hour cache, and keep the current Cinemeta
heuristic for the common case.

## Implemented

`backend/src/metadata.ts` (commit after this note) asks Wikidata only when both
Cinemeta kinds look real, or neither does. The two Cinemeta calls finish first,
so an unambiguous pair still costs no third-party request; the Wikidata answer
is capped at 2 s and any failure falls back to the series record. The type query
uses the same `WIKIDATA_HOST` constant as the TMDB-to-IMDb mapping in
`backend/src/mapping.ts`, and the result is stored by the existing metadata
cache.
