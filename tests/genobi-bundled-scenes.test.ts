import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CHARACTER_MODELS } from "../shared/scene/character-catalog";
import { createScene } from "../shared/scene/commands";

const execute = promisify(execFile);
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "genobi-bundled-scenes-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const environment = () => ({
  GENOBI_CONFIG_DIR: directory,
  GENOBI_PROFILE: "default",
  GENOBI_AGENT_SESSION: "0",
  GENOBI_AGENT_RUN: "",
});
const document = {
  ...createScene("moves", "Move library"),
  characters: [
    {
      id: "subject",
      asset: "mannequin",
      pose: "jog",
      position: [0, 0, 0],
      rotationY: 0,
      scale: 1,
    },
  ],
};

it("the shipped CLI lists the current mannequin clips and accepts a new pose", async () => {
  const call = async (input: object) => {
    const child = execute(
      process.execPath,
      ["plugins/genobi/server/genobi-cli.mjs", "scene", "--input", "-"],
      { env: { ...process.env, ...environment() } },
    );
    child.child.stdin!.end(JSON.stringify(input));
    const result = await child;
    expect(result.stderr).toBe("");
    return JSON.parse(result.stdout);
  };
  const examples = await call({ action: "examples" });
  expect(examples.models.mannequin.clips).toEqual(
    CHARACTER_MODELS.mannequin.clips,
  );
  const inspected = await call({ action: "inspect", document });
  expect(inspected.document.characters).toEqual(document.characters);
});

it("the shipped MCP uses the same catalogue and scene validation", async () => {
  const client = new Client({ name: "bundle-regression", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["plugins/genobi/server/genobi-mcp.mjs"],
    env: environment(),
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const call = async (args: Record<string, unknown>) => {
      const result = await client.callTool({
        name: "genobi_scene",
        arguments: args,
      });
      expect(result.isError).not.toBe(true);
      return JSON.parse((result.content as { text: string }[])[0].text);
    };
    const examples = await call({ action: "examples" });
    expect(examples.models.mannequin.clips).toEqual(
      CHARACTER_MODELS.mannequin.clips,
    );
    const inspected = await call({ action: "inspect", document });
    expect(inspected.document.characters).toEqual(document.characters);
  } finally {
    await client.close();
  }
});
