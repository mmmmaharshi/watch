// The page's policy, emitted into the static `_headers` file at build time and
// used by the e2e console guard, so the allow-list has one owner.
const POSTER_HOSTS = [
  "https://*.metahub.space",
  "https://static.tvmaze.com",
  "https://image.tmdb.org",
];

export const POSTER_HOST_NAMES = POSTER_HOSTS.map((host) =>
  host.replace("https://", "").replace(/^\*\./, ""),
);

// Scripts are external, so no script hashes are needed. The element-style hash
// covers the dialog's runtime-injected style; attribute styles stay inline.
export const CSP = [
  "default-src 'self'",
  `img-src 'self' data: ${POSTER_HOSTS.join(" ")}`,
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src-elem 'self' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='",
  "style-src-attr 'unsafe-inline'",
].join("; ");
