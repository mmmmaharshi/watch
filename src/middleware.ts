import { defineMiddleware } from "astro:middleware";
import { limitResponse } from "./lib/watch";

// The page is static, so only action calls reach this. Same limit as before.
export const onRequest = defineMiddleware(async ({ request }, next) => {
  if (!new URL(request.url).pathname.startsWith("/_actions")) return next();
  return limitResponse(request) ?? next();
});
