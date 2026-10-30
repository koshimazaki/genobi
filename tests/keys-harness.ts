// The local server with injected key slots: a Keychain that lives in memory
// (no real Keychain entry is ever read or written), a fake Comfy provider that
// records the key each call used, and a listener on a random loopback port.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach } from "vitest";
import { createApp } from "../server/app";
import type { Keychain } from "../server/keychain";
import type { ServerKeys } from "../server/keys";
import type { KeyKind, Provider } from "../shared/provider";

export const COMFY = "comfyui-0123456789abcdef";
export const BFL = "bfl-0123456789abcdef";

export class FakeKeychain implements Keychain {
  items = new Map<KeyKind, string>();
  async read(kind: KeyKind) {
    return this.items.get(kind);
  }
  async write(kind: KeyKind, key: string) {
    this.items.set(kind, key);
  }
  async remove(kind: KeyKind) {
    this.items.delete(kind);
  }
}

/** A Comfy Router stand-in: every submit, poll and balance check by key. */
export function fakeComfy() {
  const calls = { submit: [] as string[], poll: [] as string[] };
  let count = 0;
  const provider: Provider = {
    id: "comfy",
    async submit(_generator, _body, key) {
      calls.submit.push(key);
      count++;
      return {
        id: `router-${count}`,
        polling_url: `https://api.comfy.org/router/jobs/${count}`,
      };
    },
    async poll(_url, key) {
      calls.poll.push(key);
      return { id: "router", status: "Generating" };
    },
    async balance() {
      return { usdCents: null, checkedAt: new Date().toISOString() };
    },
    async download() {
      return new Response();
    },
  };
  return { provider, calls };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** `directory` reopens an earlier server's store, as a restart does. */
export async function startKeyServer(
  keys: ServerKeys,
  comfy?: Provider,
  reopen?: string,
) {
  let directory = reopen;
  if (!directory) {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-keys-"));
    cleanups.push(() => rm(temporary, { recursive: true, force: true }));
    directory = path.join(temporary, ".local");
  }
  const created = await createApp({
    directory,
    publicDirectory: directory,
    keys,
    providers: comfy ? { comfy } : {},
    findCommand: async (command) => command === "hermes",
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = created.app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return {
    base: `http://127.0.0.1:${address.port}`,
    directory,
    service: created.service,
  };
}

/** A fresh studio session on that server: its cookie and request helpers. */
export async function session(base: string) {
  const health = await fetch(`${base}/api/health`);
  const cookie = health.headers.get("set-cookie")!.split(";")[0];
  const json = { "Content-Type": "application/json", Cookie: cookie };
  return {
    cookie,
    quote: (body: object, extra: Record<string, string> = {}) =>
      fetch(`${base}/api/quotes`, {
        method: "POST",
        headers: { ...json, ...extra },
        body: JSON.stringify(body),
      }),
    submit: (body: object, extra: Record<string, string> = {}) =>
      fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: {
          ...json,
          "Idempotency-Key": randomUUID(),
          ...extra,
        },
        body: JSON.stringify(body),
      }),
    poll: (id: string, extra: Record<string, string> = {}) =>
      fetch(`${base}/api/jobs/${id}`, {
        headers: { Cookie: cookie, ...extra },
      }),
  };
}

export const saveKey = (base: string, kind: KeyKind, key: string) =>
  fetch(`${base}/api/keys/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
