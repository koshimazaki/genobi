import { createServer, type ViteDevServer } from "vite";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import { afterEach, expect, it } from "vitest";
import { devServerOptions } from "../server/dev-server";

let vite: ViteDevServer | undefined;
afterEach(async () => {
  await vite?.close();
  vite = undefined;
});

it("binds the development HMR socket to loopback only", async () => {
  const options = devServerOptions(process.cwd(), 4500 + (process.pid % 400));
  expect(options.server?.hmr).toMatchObject({ host: "127.0.0.1" });
  vite = await createServer({ ...options, logLevel: "silent" });
  const port = (options.server!.hmr as { port: number }).port;
  // Reachable on loopback, refused on this machine's network address.
  const reach = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = createConnection({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
  expect(await reach("127.0.0.1")).toBe(true);
  const external = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal);
  if (external) expect(await reach(external.address)).toBe(false);
});
