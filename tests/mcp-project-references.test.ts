import { describe, expect, it } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { resolvedGenerationBody } from "../mcp/inputs";
import { base } from "./house-template-fixtures";
import { studio } from "./project-copy-harness";
import { mcpAgent } from "./mcp-agent-harness";

const request = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "Keep the subject from Image 1 and soften its light.",
  imageResolution: "1k",
  imageAspectRatio: "auto",
};

describe("linked project references through MCP", () => {
  it("preserves brief bindings and resolves real owned bytes for quote and submit", async () => {
    const owner = await studio();
    const { cookie, upload, send, project, bfl } = owner;
    const brief = {
      version: 1,
      text: "Use [Image 1]",
      references: [{ id: "ref-1", label: "Image 1", assetId: "image-1" }],
    };
    await upload(cookie);
    expect(
      await send(cookie, `/${project.id}`, "PUT", {
        baseRevision: null,
        project,
        brief,
      }),
    ).toMatchObject({ status: 200 });
    const agent = await mcpAgent(owner.base);
    const { code } = await send(cookie, `/${project.id}/link`, "POST");
    const { copyId } = await agent.json("genobi_link_project", { code });
    const summary = await agent.json("genobi_project", { copyId });
    expect(summary.brief).toEqual(brief);
    expect(
      summary.assets.find(
        (asset: { assetId: string }) => asset.assetId === "image-1",
      ).file,
    ).toEqual(project.assets["image-1"].file);

    const input = {
      ...request,
      projectImageReferences: [{ copyId, assetId: "image-1" }],
    };
    const quote = await agent.json("genobi_quote", input);
    expect(quote.recipe.id).toBe("flux-3-klein-api");
    expect(bfl.submissions).toBe(0);
    const submitted = await agent.json("genobi_submit", {
      ...input,
      quoteId: quote.quoteId,
      idempotencyKey: "project-reference-0001",
    });
    expect(submitted.id).toBeTruthy();
    expect(bfl.submissions).toBe(1);
    const bytes = base().files.get(project.assets["image-1"].file.path)!;
    expect(bfl.requests[0].body.images).toEqual([
      Buffer.from(bytes).toString("base64"),
    ]);
    expect(JSON.stringify(quote)).not.toContain("base64");

    // Changing the referenced asset after quoting cannot spend the old approval.
    const second = await agent.json("genobi_quote", input);
    expect(
      await send(cookie, `/${project.id}`, "PUT", {
        baseRevision: 1,
        project: {
          ...project,
          revision: 2,
          assets: { ...project.assets, "image-1": project.assets["image-2"] },
        },
        brief,
      }),
    ).toMatchObject({ status: 200 });
    const stale = await agent.call("genobi_submit", {
      ...input,
      quoteId: second.quoteId,
      idempotencyKey: "project-reference-0002",
    });
    expect(stale.error).toBe(true);
    expect(stale.text).toContain("quote_mismatch");
    expect(bfl.submissions).toBe(1);
  });

  it("refuses unlinked files, missing assets, non-images and mixed reference forms", async () => {
    const owner = await studio();
    await owner.upload(owner.cookie);
    await owner.push(owner.cookie, null, 1);
    const agent = await mcpAgent(owner.base);
    const { code } = await owner.send(
      owner.cookie,
      `/${owner.project.id}/link`,
      "POST",
    );
    const { copyId } = await agent.json("genobi_link_project", { code });
    const other = await mcpAgent(owner.base);
    const refused = await other.call("genobi_quote", {
      ...request,
      projectImageReferences: [{ copyId, assetId: "image-1" }],
    });
    expect(refused.error).toBe(true);
    expect(refused.text).toContain("Project not found");
    for (const assetId of ["missing", "audio", "moodboard"]) {
      const bad = await agent.call("genobi_quote", {
        ...request,
        projectImageReferences: [{ copyId, assetId }],
      });
      expect(bad.error, assetId).toBe(true);
    }
    const mixed = await agent.call("genobi_quote", {
      ...request,
      projectImageReferences: [{ copyId, assetId: "image-1" }],
      imageReferences: ["data:image/png;base64,AAAA"],
    });
    expect(mixed.error).toBe(true);
    expect(mixed.text).toContain("not both");
    expect(owner.bfl.submissions).toBe(0);
  });

  it("defaults source-conditioned open Klein to the source aspect", async () => {
    const api = new GenobiApi(studioUrl());
    const body = await resolvedGenerationBody(api, {
      ...request,
      model: "flux-3-klein",
      imageAspectRatio: undefined,
      imageReferences: ["data:image/png;base64,AAAA"],
    });
    expect(body.imageAspectRatio).toBe("auto");
  });
});
