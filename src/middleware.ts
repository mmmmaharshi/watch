import { defineMiddleware } from "astro:middleware";
import { isActionRequest, limitResponse } from "./lib/watch";

// The page is static, so only action calls reach this. Same limit as before.
export const onRequest = defineMiddleware(async ({ request }, next) => {
  if (!isActionRequest(request)) {
    return next();
  }
  return limitResponse(request) ?? next();
});
