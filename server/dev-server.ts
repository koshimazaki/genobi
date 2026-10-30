import type { InlineConfig } from "vite";

/**
 * Vite's development middleware for the local server. The page is served on
 * 127.0.0.1 by `server/index.ts`; Vite opens its HMR WebSocket as a second
 * listener on `port + 1`, and without a host it binds every interface. Its
 * token check applies only to browser requests that carry an Origin, so a
 * client elsewhere on the network could connect and read the update and
 * error broadcasts (file paths, source excerpts). It is bound to loopback.
 */
export const devServerOptions = (root: string, port: number): InlineConfig => ({
  root,
  server: {
    middlewareMode: true,
    hmr: { host: "127.0.0.1", port: port + 1 },
  },
  appType: "spa",
});
