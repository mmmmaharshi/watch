// The page's policy, emitted into the static `_headers` file at build time and
// used by the e2e console guard, so the allow-list has one owner. The page
// shows no third-party images, so `img-src` stays on this origin.
//
// Scripts are external, so no script hashes are needed. The element-style hash
// covers the framework's runtime-injected style; attribute styles stay inline.
// Cloudflare injects its Web Analytics beacon into HTML at the edge, so the
// policy allows its script and the RUM endpoint it posts to.
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src-elem 'self' 'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o='",
  "style-src-attr 'unsafe-inline'",
].join("; ");
