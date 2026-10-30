import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { GenobiApi } from "../mcp/api";
import {
  MAX_REGISTRY_BYTES,
  registryPath,
  registryTools,
  type RegistryEntry,
} from "../mcp/registry-tools";
import { skillRoot } from "../mcp/skill-tools";
import { tools } from "../mcp/tools";
import { GENOBI_TOOLS } from "../server/agent-runner";

const file = path.resolve("plugins/genobi/registry.json");
const [tool] = registryTools(file);
// The tool reads one file only; a studio client it never uses stands in.
const api = {} as GenobiApi;
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true });
});
const search = async (args: Record<string, unknown>) =>
  ((await tool.run(api, args)) as { entries: RegistryEntry[] }).entries;

describe("genobi_registry", () => {
  it("is a read-only tool a studio session may call", () => {
    const registered = tools.find((t) => t.name === "genobi_registry");
    expect(registered?.annotations.readOnlyHint).toBe(true);
    expect(GENOBI_TOOLS).toContain("genobi_registry");
  });

  it("finds the registry from the bundle and from source", () => {
    for (const from of ["plugins/genobi/server", "mcp"])
      expect(registryPath(skillRoot(path.resolve(from)))).toBe(file);
  });

  it("lists the tags with no arguments", async () => {
    const { tags } = (await tool.run(api, {})) as {
      tags: Record<string, { meaning: string; entries: string[] }>;
    };
    expect(tags.sound.entries).toContain("genobi_audio_analysis");
    expect(tags.sound.meaning.length).toBeGreaterThan(5);
  });

  it("searches by tag, text and kind together", async () => {
    const sound = await search({ tag: "sound" });
    expect(sound.map((e) => e.name)).toEqual(
      expect.arrayContaining(["genobi_audio_upload", "audio-visual"]),
    );
    expect(sound.every((e) => e.tags.includes("sound"))).toBe(true);
    const skills = await search({ tag: "sound", kind: "skill" });
    expect(skills.every((e) => e.kind === "skill")).toBe(true);
    const beat = await search({ text: "Beat GRID" });
    expect(beat.map((e) => e.name)).toContain("genobi_audio_analysis");
    const submit = (await search({ text: "submit", kind: "tool" })).find(
      (e) => e.name === "genobi_submit",
    );
    expect(submit).toMatchObject({ paid: true, readOnly: false });
    expect(submit?.skills).toContain("genobi-studio");
  });

  it("refuses an unknown or malformed tag", async () => {
    await expect(search({ tag: "nope" })).rejects.toThrow(/Unknown tag/);
    const schema = z.strictObject(tool.inputSchema);
    for (const tag of ["../x", "Sound", "a b", "x".repeat(40)])
      expect(schema.safeParse({ tag }).success, tag).toBe(false);
    expect(schema.safeParse({ text: "x".repeat(101) }).success).toBe(false);
  });

  it("refuses a missing, oversized or malformed registry file", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "genobi-registry-"));
    temps.push(dir);
    const missing = registryTools(path.join(dir, "registry.json"))[0];
    await expect(missing.run(api, {})).rejects.toThrow(/missing or too large/);
    const big = path.join(dir, "big.json");
    writeFileSync(big, " ".repeat(MAX_REGISTRY_BYTES + 1));
    await expect(registryTools(big)[0].run(api, {})).rejects.toThrow(
      /too large/,
    );
    const wrong = path.join(dir, "wrong.json");
    writeFileSync(wrong, "[]");
    await expect(registryTools(wrong)[0].run(api, {})).rejects.toThrow(
      /not a registry/,
    );
  });
});
