// The local Express app under test: a fresh .local directory, a fake BFL that
// counts submissions, and a listener on a random loopback port per test.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach } from "vitest";
import { createApp } from "../server/app";
import { BflClient, type ProviderSubmission } from "../server/bfl";
import { AppError } from "../server/errors";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { Provider } from "../shared/provider";
import type { AppOptions } from "../server/app";

export const input = {
  generator: "video",
  description: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
};
export class FakeBfl extends BflClient {
  creditKeys: string[] = [];
  override async credits(key: string) {
    this.creditKeys.push(key);
    return key === "test-server-key" ? 1250 : 0;
  }
  submissions = 0;
  polls = 0;
  failSubmit = false;
  ready = false;
  media = new Uint8Array();
  requests: {
    generator: "video" | "upscale";
    body: Record<string, unknown>;
  }[] = [];
  override async submit(
    generator: "video" | "upscale",
    body: object,
  ): Promise<ProviderSubmission> {
    this.submissions++;
    this.requests.push({ generator, body: body as Record<string, unknown> });
    if (this.failSubmit)
      throw new AppError(502, "Submission uncertain.", "submission_unknown");
    return {
      id: "provider-1",
      polling_url: "https://api.bfl.ai/v1/get_result?id=provider-1",
      cost: 85,
    };
  }
  override async poll() {
    this.polls++;
    return this.ready
      ? {
          id: "provider-1",
          status: "Ready",
          result: { sample: "https://delivery.bfl.ai/fixture.mp4" },
        }
      : { id: "provider-1", status: "Generating" };
  }
  override async download() {
    return new Response(this.media);
  }
}
// Registered by each test file that imports this module.
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export async function setup(
  publicDirectory?: string,
  workflows?: WorkflowClient,
  runLocation?: AppOptions["runLocation"],
  /** The server's key slots; the BFL environment key by default. */
  keys?: AppOptions["keys"],
  /** An earlier server's `.local` directory, reopened as a restart does. */
  reopen?: string,
  /** A Comfy Router on a fake fetcher; without one a Comfy run is never sent. */
  comfy?: Provider,
  /** Further app options, such as a fake ffmpeg for the media tools. */
  extra: Partial<AppOptions> = {},
) {
  let directory = reopen;
  if (!directory) {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), "flux-studio-lite-test-"),
    );
    directory = path.join(temporary, ".local");
    cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  }
  const bfl = new FakeBfl();
  const created = await createApp({
    directory,
    publicDirectory: publicDirectory ?? directory,
    serverKey: "test-server-key",
    keys,
    providers: comfy ? { bfl, comfy } : { bfl },
    workflows,
    runLocation,
    ...extra,
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = created.app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test listener");
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/health`);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const post = (
    id: string,
    body: object = input,
    extra: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  return { ...created, bfl, directory, base, cookie, post };
}
