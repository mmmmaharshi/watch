import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Bun has no DOM. Register happy-dom before any test imports a view.
// A real URL gives location and history something to work with.
GlobalRegistrator.register({ url: "http://localhost/" });
