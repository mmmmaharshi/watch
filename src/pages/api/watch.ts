import type { APIRoute } from "astro";
import { handleApiWatch } from "../../lib/watch";

export const GET: APIRoute = async ({ request }) => handleApiWatch(request);
