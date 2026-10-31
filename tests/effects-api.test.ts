import { describe, expect, it } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { effectTools } from "../mcp/effects-tools";
import { commandTool, describeTool } from "../cli/commands";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { inspectEffectPreset, type EffectVariant } from "../shared/effects";
import { pushCopy, readCopy } from "../src/director/project-copy";
import { validateFiles } from "../src/director/bundle";
import { assetFixture } from "./director-asset-fixture";
import { setup } from "./server-harness";

describe("effect catalogue API and agent adapters", () => {
  it("shares inspection and portable variant creation/validation with MCP and CLI without spending", async () => {
    const harness = await setup();
    const api = new GenobiApi(studioUrl(harness.base));
    const list = effectTools.find((t) => t.name === "genobi_effects")!;
    const variantTool = effectTools.find(
      (t) => t.name === "genobi_effect_variant",
    )!;
    expect(list.annotations.readOnlyHint).toBe(true);
    expect(variantTool.annotations.readOnlyHint).toBe(true);
    expect(commandTool(["effects"], true)).toBe(list);
    expect(commandTool(["effect-variant"], true)).toBe(variantTool);
    expect(
      describeTool(commandTool(["director-command"], true)).inputSchema,
    ).toBeDefined();
    expect(await list.run(api, { presetId: "kinetic-title" })).toEqual({
      preset: inspectEffectPreset("kinetic-title"),
    });
    const saved = (await variantTool.run(api, {
      action: "create",
      presetId: "kinetic-title",
      name: "My title",
      parameters: { text: "HELLO" },
    })) as { variant: EffectVariant };
    expect(
      await variantTool.run(api, {
        action: "validate",
        variant: saved.variant,
      }),
    ).toEqual(saved);
    await expect(
      variantTool.run(api, {
        action: "validate",
        variant: { ...saved.variant, source: "untrusted" },
      }),
    ).rejects.toThrow(/fields/);
    await expect(list.run(api, { presetId: "missing" })).rejects.toThrow(
      /Unknown effect/,
    );
    expect(harness.bfl.submissions).toBe(0);
  });
  it("uses real recipe source locations for an atomic server edit and reloads a valid bundle", async () => {
    const harness = await setup();
    const fetcher = ((input: string, init: RequestInit = {}) =>
      fetch(`${harness.base}${input}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          cookie: harness.cookie,
        },
      })) as typeof fetch;
    const bundle = assetFixture();
    expect(await pushCopy(bundle, null, new Set(), fetcher)).toMatchObject({
      ok: true,
    });
    const response = await fetcher(
      `/api/projects/${bundle.project.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          command: {
            op: "apply-effect-preset",
            presetId: "cinematic-scan",
            instanceId: "agent-scan",
            expectedRevision: 1,
            startFrame: 0,
            durationFrames: 30,
          },
        }),
      },
    );
    expect(response.status).toBe(200);
    const reloaded = await readCopy(bundle.project.id, bundle, fetcher);
    await validateFiles(reloaded);
    expect(reloaded.project.revision).toBe(2);
    expect(reloaded.project.layers.slice(-2).map((l) => l.id)).toEqual([
      "agent-scan-scan",
      "agent-scan-hud",
    ]);
    expect(reloaded.project.modules["effects-hud"]).toEqual(
      TRUSTED_RECIPES["effects-hud"],
    );
    expect(harness.bfl.submissions).toBe(0);
  });
});
