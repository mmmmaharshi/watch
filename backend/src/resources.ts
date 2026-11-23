// Names shared by the stack declaration, the Worker declarations, and the
// tests. Changing one here changes every place that names the resource.
export const STACK_NAME = "watch";
export const SITE_WORKER = "website";
export const REFRESH_WORKER = "provider-refresh";

export const PROVIDER_LIST_NAMESPACE = "provider-list";
export const CACHE_NAMESPACE = "cache";

// Same expression as .github/workflows/refresh-providers.yml: Tue and Sat,
// 05:00 UTC. The workflow is deleted at cutover; this becomes the schedule.
export const REFRESH_CRON = "0 5 * * 2,6";

// Claimed by the prod stage only, when the domain moves off Vercel.
export const SITE_DOMAIN = "watch.maharshi.work";
