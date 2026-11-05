import { describe, expect, it } from "vitest";
import { inspirationSentence } from "../shared/director/reference-role";
import { studio } from "./project-copy-harness";
import { mcpAgent } from "./mcp-agent-harness";

const request = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "Keep the subject from Image 1 and soften its light.",
  imageResolution: "1k",
  imageAspectRatio: "auto",
};

/** A linked project whose `pin` asset is a PNG Inspiration (use "reference"). */
async function linked() {
  const owner = await studio();
  const { cookie, upload, send, project } = owner;
  await upload(cookie);
  const pin = { ...project.assets["image-2"], use: "reference" as const };
  expect(
    await send(cookie, `/${project.id}`, "PUT", {
      baseRevision: null,
      project: { ...project, assets: { ...project.assets, pin } },
      brief: {
        version: 1,
        text: "Shoot [Image 1] in the palette of [Inspiration 1].",
        references: [
          { id: "ref-1", label: "Image 1", assetId: "image-1" },
          { id: "ref-2", label: "Inspiration 1", assetId: "pin" },
        ],
      },
    }),
  ).toMatchObject({ status: 200 });
  const agent = await mcpAgent(owner.base);
  const { code } = await send(cookie, `/${project.id}/link`, "POST");
  const { copyId } = await agent.json("genobi_link_project", { code });
  return { owner, agent, copyId };
}

describe("Inspirations are not generation inputs", () => {
  it("tells the agent each Inspiration's role in genobi_project", async () => {
    const { agent, copyId } = await linked();
    const summary = await agent.json("genobi_project", { copyId });
    const role = (id: string) =>
      summary.assets.find((a: { assetId: string }) => a.assetId === id).role;
    expect(role("pin")).toBe("style");
    expect(role("image-1")).toBe("production");
    expect(summary.briefNotes).toEqual([inspirationSentence("Inspiration 1")]);
  });

  it("refuses an Inspiration in projectImageReferences, naming it and the rule", async () => {
    const { owner, agent, copyId } = await linked();
    for (const tool of ["genobi_quote", "genobi_submit"]) {
      const refused = await agent.call(tool, {
        ...request,
        projectImageReferences: [
          { copyId, assetId: "image-1" },
          { copyId, assetId: "pin" },
        ],
        ...(tool === "genobi_submit"
          ? {
              quoteId: "00000000-0000-4000-8000-000000000000",
              idempotencyKey: "inspiration-refused-1",
            }
          : {}),
      });
      expect(refused.error, tool).toBe(true);
      expect(refused.text).toContain("pin");
      expect(refused.text).toContain("is an Inspiration, a style reference");
      expect(refused.text).toContain("allowInspirationAsInput");
    }
    expect(owner.bfl.submissions).toBe(0);
  });

  it("lets a production Image through unchanged, and an Inspiration only on explicit opt-in", async () => {
    const { owner, agent, copyId } = await linked();
    const production = {
      ...request,
      projectImageReferences: [{ copyId, assetId: "image-1" }],
    };
    const quote = await agent.json("genobi_quote", production);
    expect(quote.recipe.id).toBe("flux-3-klein-api");

    const asked = {
      ...request,
      projectImageReferences: [{ copyId, assetId: "pin" }],
      allowInspirationAsInput: true,
    };
    const optedIn = await agent.json("genobi_quote", asked);
    expect(optedIn.quoteId).toBeTruthy();
    const submitted = await agent.json("genobi_submit", {
      ...asked,
      quoteId: optedIn.quoteId,
      idempotencyKey: "inspiration-opt-in-0001",
    });
    expect(submitted.id).toBeTruthy();
    expect(owner.bfl.submissions).toBe(1);
    // The opt-in steers the adapter only; the provider never sees it.
    expect(JSON.stringify(owner.bfl.requests[0].body)).not.toContain(
      "allowInspirationAsInput",
    );
  });
});
