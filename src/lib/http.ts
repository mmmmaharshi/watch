// Every JSON answer leaves through here, so the content type and the no-store
// policy have one owner. The four transport headers come from the zone rule.
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
