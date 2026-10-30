import { describe, expect, it, vi } from "vitest";
import { developTools } from "../mcp/develop-tools";
import type { GenobiApi } from "../mcp/api";
import { commandSchema, commandTool } from "../cli/commands";
import { GENOBI_TOOLS } from "../shared/agent-tools";
import { generate } from "../scripts/lib/tool-registry";
import path from "node:path";

const tool = developTools[0];
const receipt = {
  id: "0d8e4f0a-5b7c-4c1e-9d2a-3f4b5c6d7e8f",
  runner: "hermes",
  status: "starting",
  branch: "genobi/develop-move-the-mic-0d8e4f0a",
  worktree: "/repo/.claude/worktrees/genobi-develop-0d8e4f0a",
  prUrl: null,
  summary: "",
};
const fake = () => ({
  get: vi.fn(async () => receipt),
  post: vi.fn(async () => receipt),
});

describe("genobi_develop", () => {
  it("starts with the person's words and no runner, folder or permission", async () => {
    const api = fake();
    const out = (await tool.run(api as unknown as GenobiApi, {
      task: "Move the mic icon to the other side",
      mode: "change",
      files: ["src/voice/Mic.tsx"],
    })) as typeof receipt & { follow: string };
    expect(api.post).toHaveBeenCalledWith("/api/development/agent", {
      role: "developer",
      task: "Move the mic icon to the other side",
      mode: "change",
      files: ["src/voice/Mic.tsx"],
    });
    expect(out.branch).toBe(receipt.branch);
    expect(out.follow).toContain("Development");
  });

  it("reads one Developer by id", async () => {
    const api = fake();
    await tool.run(api as unknown as GenobiApi, { id: receipt.id });
    expect(api.get).toHaveBeenCalledWith(
      `/api/development/agent/${receipt.id}`,
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("bounds its input before any request", () => {
    const schema = commandSchema(tool);
    for (const bad of [
      {},
      { task: "x" },
      { mode: "pr" },
      { task: "x", mode: "pr", id: receipt.id },
      { id: receipt.id, files: ["a.ts"] },
      { task: "x".repeat(4001), mode: "change" },
      { task: "x", mode: "merge" },
      { task: "x", mode: "change", files: ["../up.ts"] },
      { task: "x", mode: "change", runner: "claude" },
      { id: "not-a-uuid" },
    ])
      expect(schema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(schema.safeParse({ task: "x", mode: "pr" }).success).toBe(true);
  });

  it("is in the session's tools, unpaid, a CLI verb and a registry entry", async () => {
    expect(GENOBI_TOOLS).toContain("genobi_develop");
    expect(tool.paid).toBeUndefined();
    expect(commandTool(["develop"], true).name).toBe("genobi_develop");
    const { registry, problems } = await generate(
      path.join(import.meta.dirname, ".."),
    );
    expect(problems).toEqual([]);
    const names = registry.entries.map((e) => e.name);
    expect(names).toContain("genobi_develop");
    expect(names).toContain("genobi-develop");
  });
});
