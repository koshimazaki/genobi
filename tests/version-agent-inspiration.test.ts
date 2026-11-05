// Make my version → Make it with the agent (#89) under the Inspiration rule
// (#77): the dropped image is kept as an Inspiration (use "reference"), and
// the person's sentence asks for it to be used, so the prompt the agent starts
// from names the opt-in, and the adapter takes the image only with it.
import { describe, expect, it } from "vitest";
import { findMixTemplate } from "../shared/templates/catalogue";
import { versionAgentPrompt } from "../shared/templates/version-agent";
import { studio } from "./project-copy-harness";
import { mcpAgent } from "./mcp-agent-harness";

const fruits = findMixTemplate("fruits-swap")!;
// The shape importAgentFile mints for a dropped still.
const dropped = "asset-2b4c1d2e-0000-4000-8000-0000000000aa";
const still = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "A voxel pear in the apple's place, the look of Image 1.",
  imageResolution: "1k",
  imageAspectRatio: "auto",
};

/** A linked fruits-swap copy holding the dropped still as an Inspiration. */
async function linked() {
  const owner = await studio();
  const { cookie, upload, send, project } = owner;
  await upload(cookie);
  const reference = { ...project.assets["image-2"], use: "reference" as const };
  expect(
    await send(cookie, `/${project.id}`, "PUT", {
      baseRevision: null,
      project: {
        ...project,
        assets: { ...project.assets, [dropped]: reference },
      },
    }),
  ).toMatchObject({ status: 200 });
  const agent = await mcpAgent(owner.base);
  const { code } = await send(cookie, `/${project.id}/link`, "POST");
  const { copyId } = await agent.json("genobi_link_project", { code });
  return { owner, agent, copyId };
}

describe("Make it with the agent's dropped reference", () => {
  it("is offered as an input in the prompt, refused without the opt-in, and runs with it", async () => {
    const prompt = versionAgentPrompt(
      fruits,
      { id: dropped, name: "my-pear.png", kind: "image" },
      "Swap the apple with this",
    );
    expect(prompt).toContain(
      "offered this image explicitly as an input for this request",
    );
    expect(prompt).toContain(
      `passes ${dropped} as an image reference, set allowInspirationAsInput: true`,
    );

    const { owner, agent, copyId } = await linked();
    const summary = await agent.json("genobi_project", { copyId });
    expect(
      summary.assets.find((a: { assetId: string }) => a.assetId === dropped)
        .role,
    ).toBe("style");

    const withReference = {
      ...still,
      projectImageReferences: [{ copyId, assetId: dropped }],
    };
    // Without the opt-in the prompt names, the adapter refuses the still.
    const refused = await agent.call("genobi_quote", withReference);
    expect(refused.error).toBe(true);
    expect(refused.text).toContain("is an Inspiration, a style reference");

    // With it, the quote and the approved submit go through.
    const asked = { ...withReference, allowInspirationAsInput: true };
    const quote = await agent.json("genobi_quote", asked);
    expect(quote.quoteId).toBeTruthy();
    const submitted = await agent.json("genobi_submit", {
      ...asked,
      quoteId: quote.quoteId,
      idempotencyKey: "version-agent-reference-0001",
    });
    expect(submitted.id).toBeTruthy();
    expect(owner.bfl.submissions).toBe(1);
  });
});
