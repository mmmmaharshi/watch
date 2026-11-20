import cloudflare from "@cloudflare/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...cloudflare,
  ignorePatterns: [...(cloudflare.ignorePatterns ?? []), ".agents/"],
  overrides: [
    // Test fixtures intentionally build invalid shapes (junk localStorage,
    // unknown JSON); behavioral assertions guard the behavior, not the types.
    {
      files: ["**/*.test.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "quality/no-known-value-widening": "off",
      },
    },
    ...(cloudflare.overrides ?? []),
  ],
});
