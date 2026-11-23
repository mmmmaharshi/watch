// The Alchemy CLI looks for this file at the repo root, so the deploy runs
// with the Astro project as its working directory. The declaration lives in
// the backend workspace, under the same typecheck as the services it wires.
export { default } from "./backend/src/stack";
