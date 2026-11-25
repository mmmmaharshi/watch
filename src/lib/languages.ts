// The search form's language options. Codes are ISO 639-1, which is what TMDB
// reports as `original_language`. The empty code means "any language" and keeps
// the default search path.
export const LANGUAGES = [
  { code: "", name: "Any language" },
  { code: "en", name: "English" },
  { code: "te", name: "Telugu" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "ml", name: "Malayalam" },
  { code: "kn", name: "Kannada" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "pa", name: "Punjabi" },
  { code: "gu", name: "Gujarati" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "tr", name: "Turkish" },
  { code: "id", name: "Indonesian" },
] as const;

export const isLanguage = (code: string): boolean =>
  LANGUAGES.some((language) => language.code === code);
