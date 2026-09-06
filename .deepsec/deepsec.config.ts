import { defineConfig } from "deepsec/config";
import { generatedMatchersPlugin } from "./generated-matchers.js";

export default defineConfig({
  defaultModel: "gpt-5.5", // <deepsec:default-model>
  defaultAgent: "codex", // <deepsec:default-agent>
  ai: {"mode":"gateway","provider":"vercel"}, // <deepsec:model-route>
  projects: [
    { id: "watch-movie", root: ".." },
    // <deepsec:projects-insert-above>
  ],
  plugins: [generatedMatchersPlugin],
});
