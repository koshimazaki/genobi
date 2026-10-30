// The Genobi favicon set: the SVG source, the 32 px ICO and the 180 px touch
// icon exist, the studio page links them, and the local server answers
// `GET /favicon.ico` the way a browser expects instead of a 404.
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { devServerOptions } from "../server/dev-server";

const root = process.cwd();
const ICON_TYPES = ["image/x-icon", "image/vnd.microsoft.icon"];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let vite: ViteDevServer | undefined;
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await vite?.close();
  vite = undefined;
});

async function listen(app: express.Express) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return `http://127.0.0.1:${address.port}`;
}

describe("the favicon files", () => {
  it("ship in public/ and the studio page links all three", async () => {
    const html = await readFile(path.join(root, "index.html"), "utf8");
    expect(html).toContain(
      '<link rel="icon" href="/favicon.svg?v=genobi-011" type="image/svg+xml" />',
    );
    expect(html).toContain(
      '<link rel="icon" href="/favicon.ico?v=genobi-011" sizes="32x32" />',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=genobi-011" />',
    );

    const svg = await readFile(path.join(root, "public/favicon.svg"), "utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    // Self-contained: no theme variable, script or outside reference.
    expect(svg).not.toMatch(/var\(|currentColor|<script|href=/);

    // One 32 px PNG behind a valid ICONDIR and ICONDIRENTRY.
    const ico = await readFile(path.join(root, "public/favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect([ico[6], ico[7]]).toEqual([32, 32]);
    const length = ico.readUInt32LE(14);
    const offset = ico.readUInt32LE(18);
    expect(offset + length).toBe(ico.length);
    expect([...ico.subarray(offset, offset + 8)]).toEqual(PNG_SIGNATURE);
    expect(ico.readUInt32BE(offset + 16)).toBe(32); // IHDR width
    expect(ico.readUInt32BE(offset + 20)).toBe(32); // IHDR height

    const touch = await readFile(
      path.join(root, "public/apple-touch-icon.png"),
    );
    expect([...touch.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(touch.readUInt32BE(16)).toBe(180);
    expect(touch.readUInt32BE(20)).toBe(180);
  });
});

describe("the local server's favicon", () => {
  it("answers GET /favicon.ico with an icon through the Vite middleware", async () => {
    // As `server/index.ts` mounts it outside production.
    const options = devServerOptions(root, 4900 + (process.pid % 400));
    vite = await createServer({ ...options, logLevel: "silent" });
    const app = express();
    app.use(vite.middlewares);
    const base = await listen(app);

    const response = await fetch(`${base}/favicon.ico`);
    expect(response.status).toBe(200);
    expect(ICON_TYPES).toContain(response.headers.get("content-type"));
    const body = Buffer.from(await response.arrayBuffer());
    expect(body).toEqual(await readFile(path.join(root, "public/favicon.ico")));
  });

  it("answers GET /favicon.ico with an icon from the production static folder", async () => {
    // Production serves `dist/`, which `vite build` copies from `public/`
    // unchanged; the same `express.static` over `public/` stands in for it.
    const app = express();
    app.use(express.static(path.join(root, "public")));
    const base = await listen(app);

    const response = await fetch(`${base}/favicon.ico`);
    expect(response.status).toBe(200);
    expect(ICON_TYPES).toContain(response.headers.get("content-type"));
    const svg = await fetch(`${base}/favicon.svg`);
    expect(svg.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
  });
});
