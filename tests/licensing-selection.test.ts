import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registry } from "../shared/registry";
import {
  matchesSelection,
  parseSelection,
} from "../shared/licensing/selection";
import { contextBlock, parseAgentContext } from "../shared/agent-context";
import { scopedContext } from "../server/agent-scope";
import { GENOBI_TOOLS } from "../server/agent-runner";
import { tools } from "../mcp/tools";
import { GenobiApi } from "../mcp/api";
import { readSelection, saveSelection } from "../src/licensing/preferences";
import { resetStudioContext, studioContext } from "../src/agent/studio-context";

afterEach(() => {
  vi.unstubAllGlobals();
  resetStudioContext();
});

describe("global model preferences shared by agents", () => {
  it("keeps cloud and open weights independent", () => {
    const candidates = registry.filter((entry) =>
      matchesSelection(entry, {
        family: "ltx",
        weights: "open-weights",
        execution: "cloud",
        agent: "hermes",
      }),
    );
    expect(candidates.some((entry) => entry.id === "ltx-2-5-fast")).toBe(true);
    expect(
      candidates.every((entry) => entry.open && entry.family === "ltx"),
    ).toBe(true);
    expect(candidates.some((entry) => entry.id === "ltx-2-5-pro")).toBe(false);
  });
  it("commercial-only keeps closed models and drops open weights", () => {
    const candidates = registry.filter((entry) =>
      matchesSelection(entry, { weights: "commercial" }),
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((entry) => !entry.open)).toBe(true);
    expect(candidates.some((entry) => entry.id === "ltx-2-5-fast")).toBe(false);
  });
  it("local-only excludes API routes and coming entries", () => {
    const candidates = registry.filter((entry) =>
      matchesSelection(entry, { execution: "local" }),
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        (entry) => entry.status === "ready" && entry.route === "workflow",
      ),
    ).toBe(true);
  });
  it("does not invent a model or change selection based on harness", () => {
    const any = registry.filter((entry) => matchesSelection(entry, {}));
    expect(any).toEqual(registry);
    expect(
      registry.filter((entry) => matchesSelection(entry, { agent: "hermes" })),
    ).toEqual(any);
  });
  it("validates enums and strips unknown fields rather than carrying credentials", () => {
    expect(parseSelection({ family: "flux", apiKey: "secret" })).toEqual({
      family: "flux",
    });
    for (const input of [
      null,
      [],
      { family: "other" },
      { weights: "MIT" },
      { execution: "remote-shell" },
      { agent: "unknown" },
    ])
      expect(() => parseSelection(input)).toThrow();
  });
  it("retains choices through context parsing and ownership filtering", () => {
    const selection = {
      family: "flux",
      execution: "local",
      agent: "codex",
    } as const;
    const context = parseAgentContext({ picks: [], selection });
    const scoped = scopedContext(
      context,
      "owner",
      () => false,
      undefined,
    ).context!;
    expect(scoped.selection).toEqual(selection);
    expect(contextBlock(scoped)).toContain('"agent":"codex"');
    expect(contextBlock(scoped)).toContain("not permission to spend");
  });
  it("offers the read-only licence check to both built-in runner plans", () => {
    expect(GENOBI_TOOLS).toContain("genobi_licences");
    expect(GENOBI_TOOLS).not.toContain("genobi_submit");
    expect(
      tools.find((t) => t.name === "genobi_licences")!.annotations
        ?.readOnlyHint,
    ).toBe(true);
  });
  it("filters MCP discovery without fetching, paying or claiming readiness", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("No request allowed"));
    const api = new GenobiApi(new URL("http://127.0.0.1:4317"), fetcher);
    const tool = tools.find((t) => t.name === "genobi_models")!;
    const args = z.object(tool.inputSchema).parse({
      status: "ready",
      selection: { family: "flux", execution: "local" },
    });
    const result = (await tool.run(api, args)) as {
      family: string;
      route: string;
      runLocations: string[];
    }[];
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (row) =>
          row.family === "flux" &&
          row.route === "workflow" &&
          row.runLocations.includes("local"),
      ),
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("saves global choices even without a licence purpose or current picks", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    saveSelection({ family: "ltx", execution: "cloud" });
    expect(readSelection()).toEqual({ family: "ltx", execution: "cloud" });
    expect(studioContext()?.selection).toEqual(readSelection());
    expect(studioContext()?.usage).toBeUndefined();
    saveSelection({ family: "any", execution: "any" });
    expect(studioContext()?.selection).toEqual({
      family: "any",
      execution: "any",
    });
  });
});
