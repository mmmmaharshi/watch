// Every string the UI shows. DESIGN.md quotes the same copy.
export const COPY = {
  title: "watch — find a stream link by IMDb or TMDB ID",
  wordmark: "watch",
  intro: "Free, no sign-up. One ID in, one stream link out.",
  fieldLabel: "IMDb or TMDB ID or link",
  placeholder: "IMDb or TMDB ID, or link",
  hint: "Eg: tt0371746",
  submit: "Watch now",
  footer:
    "We don't host anything. We only link to third-party providers. Check the URL before playing. " +
    "Prefer an ad blocker for safety.",
  copied: "Link copied.",
  copyFailed: "Copy failed. Select the link text to copy it manually.",
  cancel: "Cancel",
  watch: "Watch",
  retry: "Get another stream link",
  copy: "Copy link",
  imdb: "IMDb",
  provider: "Provider",
  streamUrl: "Stream URL",
  // Shared with the Worker: the outcome and lookup error text.
  tmdbNotFound: "TMDB ID not found",
  lookupFailed: "Something went wrong. Try again.",
} as const;

// The dialog's exit note names the provider, so it cannot be a plain string.
export const exitNote = (provider: string): string =>
  `You'll leave this site and play on ${provider}. We don't control external sites.`;
