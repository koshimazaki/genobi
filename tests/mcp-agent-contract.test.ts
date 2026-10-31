import { describe, expect, it, vi } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { tools } from "../mcp/tools";
import { commandTool } from "../cli/commands";
import { GENOBI_TOOLS } from "../shared/agent-tools";

describe("agent discovery and byte reads", () => {
  it("exposes the three documented planning tools in built-in sessions while retaining paid restrictions", () => {
    for (const name of [
      "genobi_template_plan",
      "genobi_world_recipe",
      "genobi_audio_analysis",
    ]) {
      expect(GENOBI_TOOLS).toContain(name);
      expect(commandTool([name], true).name).toBe(name);
    }
    expect(() => commandTool(["submit"], true)).toThrow("unavailable");
    expect(() => commandTool(["run-location"], true)).toThrow("unavailable");
  });

  it("reports explicit runtime capabilities and tolerates a legacy 404 only", async () => {
    const capabilities = {
      schemaVersion: 1,
      runtime: "local",
      features: { voice: { supported: true } },
    };
    let status = 200;
    const fetcher = vi.fn<typeof fetch>(async (target) => {
      if (new URL(String(target)).pathname === "/api/capabilities")
        return Response.json(
          status === 200 ? capabilities : { error: "Failed" },
          { status },
        );
      return Response.json({ ok: true });
    });
    const api = new GenobiApi(studioUrl(), fetcher);
    const tool = tools.find((t) => t.name === "genobi_status")!;
    expect(await tool.run(api, {})).toMatchObject({ capabilities });
    status = 404;
    expect(await tool.run(api, {})).not.toHaveProperty("capabilities");
    status = 500;
    await expect(tool.run(api, {})).rejects.toThrow("Failed");
  });

  it("cancels an oversized streaming media response even without content-length", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async (target) => {
      if (new URL(String(target)).pathname === "/api/health")
        return Response.json({ ok: true });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4));
            controller.enqueue(new Uint8Array(4));
          },
          cancel,
        }),
      );
    });
    await expect(
      new GenobiApi(studioUrl(), fetcher).bytes("/api/clips/clip", 5),
    ).rejects.toThrow("over 5 bytes");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not report a paid outcome as uncertain when project resolution fails before submission", async () => {
    const fetcher = vi.fn<typeof fetch>(async (target) =>
      new URL(String(target)).pathname === "/api/health"
        ? Response.json({ ok: true })
        : Response.json({ error: "Project read failed" }, { status: 500 }),
    );
    const api = new GenobiApi(studioUrl(), fetcher);
    const tool = tools.find((t) => t.name === "genobi_submit")!;
    await expect(
      tool.run(api, {
        generator: "image",
        model: "flux-3-klein-api",
        description: "A test.",
        projectImageReferences: [
          { copyId: "project.abcdefghjk", assetId: "image" },
        ],
        quoteId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "not-sent-test",
      }),
    ).rejects.toThrow(/^Project read failed$/);
    expect(
      fetcher.mock.calls.every(
        ([target]) => new URL(String(target)).pathname !== "/api/jobs",
      ),
    ).toBe(true);
  });
});
