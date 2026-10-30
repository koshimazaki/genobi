import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApp } from "../server/app";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { kleinWorkflow } from "../shared/comfy/klein";

// The run location and workflow swapping through the agent tools, against the
// real local server: the tools change the same session record the studio reads.
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function agent() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-mcp-run-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const fake: FakeComfy = await fakeComfy({
    nodes: nodesFor(kleinWorkflow.graph),
  });
  cleanups.push(() => fake.close());
  const directory = path.join(temporary, ".local");
  const { app, store } = await createApp({
    directory,
    publicDirectory: directory,
    runLocation: {
      destination: { kind: "cloud" },
      local: new LocalComfyWorkflows({ url: fake.url }),
    },
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const api = new GenobiApi(studioUrl(`http://127.0.0.1:${address.port}`));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  return { call, store, fake };
}

describe("MCP: run location and workflow swapping", () => {
  it("reads and sets the run location for the agent's session", async () => {
    const { call, store } = await agent();
    const read = await call("genobi_run_location");
    expect(read.error).toBe(false);
    expect(JSON.parse(read.text)).toMatchObject({
      location: "cloud",
      local: { reachable: true },
    });
    const set = await call("genobi_run_location", { location: "local" });
    expect(JSON.parse(set.text)).toMatchObject({
      location: "local",
      source: "session",
    });
    // The server's one store now holds the agent session's choice.
    expect(store.data.settings).toMatchObject([{ location: "local" }]);
    const both = await call("genobi_run_location", { location: "both" });
    expect(both.error).toBe(false);
    expect(JSON.parse(both.text)).toMatchObject({
      mode: "both",
      location: "local",
    });
    expect(store.data.settings).toMatchObject([{ location: "both" }]);
    const bad = await call("genobi_run_location", { location: "mars" });
    expect(bad.error).toBe(true);
  });

  it("lists, checks and swaps workflows, refusing a mismatch", async () => {
    const { call, fake } = await agent();
    const listed = JSON.parse((await call("genobi_workflows")).text);
    expect(listed.entries.map((e: { entry: string }) => e.entry)).toEqual([
      "minimax-h3",
      "minimax-h3-canny",
      "minimax-h3-depth",
      "minimax-h3-combined",
      "openjutsu-swap",
      "ltx-2-5-open",
      "ltx-2-5-akuspace",
      "seedvr2-upscale",
      "flux-3-klein",
      "minimax-music-3",
    ]);
    const checked = JSON.parse(
      (await call("genobi_workflows", { checkLocal: true })).text,
    );
    expect(checked.local.templates["flux-3-klein-t2i"].missingNodes).toEqual(
      [],
    );
    const swapped = await call("genobi_workflow_select", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-t2v",
    });
    expect(swapped.error).toBe(false);
    expect(
      JSON.parse(swapped.text).entries.find(
        (e: { entry: string }) => e.entry === "ltx-2-5-akuspace",
      ).selected,
    ).toBe("ltx-2-5-t2v");
    const refused = await call("genobi_workflow_select", {
      entry: "flux-3-klein",
      template: "ltx-2-5-t2v",
    });
    expect(refused.error).toBe(true);
    expect(refused.text).toMatch(
      /cannot stand behind Image.*workflow_mismatch/,
    );
    // Nothing was submitted to the local ComfyUI.
    expect(fake.prompts).toHaveLength(0);
  });
});
