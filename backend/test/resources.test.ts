import { assert, describe, it } from "@effect/vitest";
import { SITE_URL } from "../../src/consts";
import {
  CACHE_NAMESPACE,
  PROVIDER_LIST_NAMESPACE,
  REFRESH_CRON,
  REFRESH_WORKER,
  SITE_DOMAIN,
  SITE_WORKER,
  STACK_NAME,
} from "../src/resources";

describe("stack shape", () => {
  it("the cron keeps the GitHub schedule: Tuesday and Saturday at 05:00 UTC", () => {
    assert.strictEqual(REFRESH_CRON, "0 5 * * 2,6");
  });

  it("the declared domain is the site's canonical host", () => {
    assert.strictEqual(SITE_DOMAIN, new URL(SITE_URL).host);
  });

  it("resource names are unique, lowercase, and DNS-safe", () => {
    const names = [
      STACK_NAME,
      SITE_WORKER,
      REFRESH_WORKER,
      PROVIDER_LIST_NAMESPACE,
      CACHE_NAMESPACE,
    ];

    assert.strictEqual(new Set(names).size, names.length);
    for (const name of names) {
      assert.ok(/^[a-z][a-z0-9-]*$/.test(name), `${name} is not DNS-safe`);
    }
  });
});
