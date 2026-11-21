import type { server } from "../actions/index";

declare global {
  type WatchServer = typeof server;
}

export {};
