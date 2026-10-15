import os from "node:os";
import { handler } from "./src/handler";

// The entrypoint Vercel's Bun preset looks for (server.ts in the project root).
// Bun.serve must be called at module startup, with no condition around it:
// Vercel detects the call and routes requests through it, and the deployed
// bundle is loaded in a way that makes "is this the main module?" unreliable.
// The port and hostname only apply when running locally.
const server = Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  fetch: (req, srv) => handler(req, srv),
});

const nets = Object.values(os.networkInterfaces() ?? {})
  .flat()
  .filter((n): n is os.NetworkInterfaceInfo => n != null);
const lanIp = nets.find(n => n.family === "IPv4" && !n.internal)?.address ?? "localhost";
console.log(`Local: http://localhost:${server.port}`);
console.log(`LAN: http://${lanIp}:${server.port}`);
