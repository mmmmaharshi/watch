# Cinemeta Alternatives (IMDb-ID Metadata Lookup)

Context: `src/handler.ts` resolves an IMDb ID to `{ type, name, year, rating, description }` via
`https://v3-cinemeta.strem.io/meta/{series|movie}/{id}.json`, racing both kinds in parallel.
Only `type` (`movie`|`tv`) is load-bearing for `/api/watch`; the rest is returned to the client.
Load profile: 1h metadata cache, ~100 req/15min per client.

## Comparison

| Candidate | Key? | Cost / limits | IMDb-ID lookup | Movies + series | title/year/rating/desc | Verdict |
|---|---|---|---|---|---|---|
| OMDb | Yes | Free key, 1,000 req/day; patron tiers raise it | Yes (`i=tt...`) | Yes (`type`: movie/series/episode) | Yes (`Title`/`Year`/`imdbRating`/`Plot`, `Type`) | Closest drop-in shape, but key + low daily cap |
| TMDB | Yes | Free for non-commercial (attribution); ~40 req/s soft limit, respect 429 | Yes (`/3/find/{id}?external_source=imdb_id`) | Yes (`movie_results` vs `tv_results`) | Yes (`title`/`release_date`, `overview`, `vote_average` — TMDB rating, not IMDb) | Best long-term primary/fallback; needs key + 1–2 calls per lookup |
| Self-hosted Cinemeta-protocol addon (tmdb-addon, cinebetter) | Depends | Self-host cost; upstream still needs TMDB key | Yes, same `/meta/{type}/{id}.json` shape | Yes | Yes (via TMDB/IMDb data) | Zero client-code change, but just moves the dependency |
| IMDb datasets (bulk TSV) | No | Free download, daily refresh; non-commercial licence only | Yes (`tconst` = `tt...`) | Yes (`titleType`) | Partial: title/year/rating yes, **no description** | Type-detection fallback only; heavy ops, licence restricts |
| TVMaze | No | Free, no key; ≥20 calls/10s per IP | Yes (`/lookup/shows?imdb=tt...`) | Series only, no movies | Partial: title/year yes, own `rating.average` (not IMDb), `summary` as description | Series-only supplement, not a replacement |

## 1. OMDb API — closest shape, key + low cap

- Lookup by IMDb ID is the documented primary parameter: "`i`: A valid IMDb ID (e.g. tt1285016)"
  (https://www.omdbapi.com/).
- `type` parameter accepts `movie, series, episode`, covering movie-vs-series detection
  (https://www.omdbapi.com/).
- Free keys carry a "1,000 daily limit"; higher quotas are patron tiers
  (https://www.omdbapi.com/apikey.aspx).
- Content is community-maintained and licensed CC BY-NC 4.0; "not endorsed by or affiliated with IMDb.com"
  (https://www.omdbapi.com/).
- Verdict: response shape maps almost 1:1 (`Title`/`Year`/`imdbRating`/`Plot`/`Type`), but every deploy needs
  its own key and 1,000 req/day is exhausted by ~10 active clients at this app's rate limit — keep as
  second fallback at most.

## 2. TMDB API — best long-term fallback

- `GET /3/find/{external_id}` with `external_source=imdb_id` "search[es] all objects (movies, TV shows
  and people)" and supports IMDb as a source for both movies and TV shows
  (https://developer.themoviedb.org/reference/find-by-id).
- Follow-up details return `title`, `release_date`, `overview`, `vote_average`/`vote_count`
  (https://developer.themoviedb.org/reference/movie-details); whichever of `movie_results`/`tv_results`
  is non-empty gives movie-vs-series detection, so the two calls can be collapsed to one `find` plus one
  details fetch (or fewer with `append_to_response`).
- Free "for non-commercial purposes as long as you attribute TMDB"; commercial use needs a licence via
  sales@themoviedb.org (https://developer.themoviedb.org/docs/faq). Attribution notice + logo required
  (https://developer.themoviedb.org/docs/faq).
- Legacy "40 requests every 10 seconds" limit was disabled 2019-12-16; current guidance is "somewhere in
  the 40 requests per second range" with `429` backoff
  (https://developer.themoviedb.org/docs/rate-limiting) — far above this app's ~100 req/15min/client.
- Caveats: ratings are TMDB community scores, not IMDb ratings; needs an API key/read token; two-step
  lookup per ID (mitigated by the existing 1h cache).
- Verdict: recommended fallback behind Cinemeta. Generous limits, actively maintained, covers all fields
  except a true IMDb rating.

## 3. Self-hosted Cinemeta-protocol addons — zero client change, moves the dependency

- Cinemeta itself is closed-source and Stremio-hosted; the documented integration is the
  `https://v3-cinemeta.strem.io/meta/{type}/{id}.json` endpoint
  (https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/advanced.md). There is no official
  self-hostable Cinemeta repo.
- Community option A: `mrcanelas/tmdb-addon` is self-hostable (one-click Vercel deploy) but requires
  `TMDB_API` (and `FANART_API`) env keys (https://github.com/mrcanelas/tmdb-addon).
- Community option B: `theacrat/cinebetter` "replicates Cinemeta's functionality entirely, but with true
  IMDb data", runs on Docker/Bun or Cloudflare Workers, but requires "a TMDB API read access token"
  (https://github.com/theacrat/cinebetter).
- Verdict: any of these is a drop-in (`/meta/{type}/{id}.json`, no client-code change) and a good
  hedge against Cinemeta downtime, but each still needs a TMDB key upstream plus hosting — prefer only
  if keyless operation is worth running infra.

## 4. IMDb datasets — keyless, but no descriptions and non-commercial only

- Files live at https://datasets.imdbws.com/, "refreshed daily", gzipped TSV
  (https://developer.imdb.com/non-commercial-datasets).
- `title.basics.tsv.gz` gives `tconst` (= IMDb ID), `titleType` (movie vs tvSeries — direct type
  detection), `primaryTitle`, `startYear`; `title.ratings.tsv.gz` gives `averageRating`
  (https://developer.imdb.com/non-commercial-datasets). No plot/description column exists in any file.
- "Subsets of IMDb data are available ... for personal and non-commercial use" under the licence terms
  (https://developer.imdb.com/non-commercial-datasets) — commercial use needs the paid AWS Data Exchange
  products (https://data.imdb.com/).
- Verdict: viable keyless fallback for the load-bearing `type` (+ title/year/rating) via a small sidecar
  that downloads and indexes two TSVs daily; cannot supply `description`, and ops cost (download, parse,
  host ~1GB+ uncompressed) exceeds its value while Cinemeta/TMDB work.

## 5. TVMaze — series-only supplement

- `GET /lookup/shows?imdb=tt...` returns "a HTTP 301 redirect to the show's URL" on match, else 404
  (https://www.tvmaze.com/api). No key required; root is https://api.tvmaze.com
  (https://www.tvmaze.com/api).
- Rate limit: "at least 20 calls every 10 seconds per IP", 429 on excess
  (https://www.tvmaze.com/api). Data licensed CC BY-SA, attribution required
  (https://www.tvmaze.com/api).
- Covers TV only — no movie endpoint exists — and ratings are TVMaze's own scores, not IMDb's.
- Verdict: useful as a third-tier series-type confirmer; cannot replace Cinemeta alone.

## Recommendation

Keep Cinemeta as primary (keyless, exact fields). Add **TMDB `find-by-IMDb-ID` as the single fallback**:
one key covers movies + series + all display fields at ~40 req/s, and the existing 1h cache absorbs the
extra lookup call. Accept the trade-off explicitly: fallback ratings are TMDB scores, not IMDb ratings —
label them as such or omit `rating` on the fallback path. Skip OMDb (daily cap too low for multi-client
use), skip IMDb datasets (no descriptions, non-commercial licence, heavy ops), and self-host a
Cinemeta-protocol addon only if keyless operation later becomes a hard requirement.
