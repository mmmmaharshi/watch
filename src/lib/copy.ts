// Every string a person reads, in one place: the page, the machine's status
// lines, the Worker's outcome errors, and the static shell's meta text.
const INTRO = "Free, no sign-up.";

export const COPY = {
  title: "watch — find a stream link by IMDb or TMDB ID",
  wordmark: "watch",
  intro: INTRO,
  fieldLabel: "IMDb or TMDB ID or link",
  placeholder: "IMDb or TMDB ID, or link",
  hint: "Eg:",
  exampleId: "tt0371746",
  submit: "Find a stream",
  footer: "We only link to third-party providers. Prefer an ad blocker for safety.",
  copied: "Link copied.",
  copyFailed: "Copy failed. Select the link text to copy it manually.",
  cancel: "Cancel",
  watch: "Watch",
  retry: "Get another stream link",
  copy: "Copy link",
  imdb: "IMDb",
  provider: "Provider",
  streamUrl: "Stream URL",
  progress: {
    looking: "Finding a working stream...",
    retrying: "Finding another stream...",
  },
  // The result dialog's type label.
  resultTypes: { tv: "TV Show", movie: "Movie" },
  // The machine's field and failure lines.
  machine: {
    empty: "Enter an IMDb or TMDB ID or link.",
    badLink: "Use an IMDb title link or a TMDB movie or TV link.",
    noProviders: "No other providers available.",
    failed: "Something went wrong. Try again.",
  },
  // The Worker's outcome errors, shown after a failed lookup.
  outcome: {
    invalidInput: "Invalid IMDb or TMDB ID",
    tmdbAmbiguous: "TMDB ID is ambiguous. Use a movie or TV link.",
    tmdbNotFound: "TMDB ID not found",
    metadataMissing: "Couldn't tell if that's a movie or a TV show.",
    noProviders: "No working providers available",
  },
  // The static page around the app.
  shell: {
    description: `${INTRO} Paste an IMDb or TMDB ID or link.`,
    noscript: "This page needs JavaScript to find a stream link.",
    imageAlt: "watch — paste an IMDb or TMDB ID or link to get a stream link.",
  },
} as const;

// The dialog's exit note names the provider, so it cannot be a plain string.
export const exitNote = (provider: string): string =>
  `You'll leave this site and play on ${provider}.`;
