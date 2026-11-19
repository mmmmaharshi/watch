// The shareable link for a title: the app URL with the ID in the hash,
// so shared links never create a second URL for search engines to index.
export function shareUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/#id=${encodeURIComponent(id)}`;
}
