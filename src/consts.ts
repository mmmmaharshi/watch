export const SITE_URL = "https://watch.maharshi.work";

// One name for every upstream call: change it here, not in each module.
export const USER_AGENT = "watch-app/1.0 (+https://github.com/mmmmaharshi/watch)";

// Upstream API hosts. Endpoints live with the modules that call them; the
// hosts live here so a move breaks every caller at once, not silently.
export const CINEMETA_HOST = "https://v3-cinemeta.strem.io";
export const TVMAZE_HOST = "https://api.tvmaze.com";
