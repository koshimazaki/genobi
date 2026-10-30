import { describe, expect, it } from "vitest";
import { approvalPlan } from "../shared/agent-approval";
import { emptyCamera } from "../shared/camera";
import { composePrompt } from "../shared/presets";
import { input } from "./server-harness";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalPrompt, planLine } from "../src/agent/AgentApprovals";

const quote = {
  id: "q",
  estimateUsd: 0.4,
  recipe: { id: "ltx-2-5-fast", version: 1, route: "router" as const },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("an approval shows the prompt the run sends", () => {
  it("includes the camera sentences, not only the agent's description", () => {
    const quoted = {
      ...input,
      generator: "video",
      model: "ltx-2.5",
      description: "A ceramic vessel.",
      camera: { ...emptyCamera, movements: "pull-back" },
    } as never;
    const sent = composePrompt(quoted);
    expect(sent).not.toBe("A ceramic vessel.");
    const plan = approvalPlan(quoted, quote);
    expect(plan.description).toBe(sent.replace(/\s+/g, " ").trim());
  });

  const image = (description: string) =>
    ({
      ...input,
      generator: "image",
      model: "flux-3-klein",
      description,
      imageResolution: "1.5k",
      imageAspectRatio: "9:16",
    }) as never;
  const imageQuote = {
    ...quote,
    recipe: { id: "flux-3-klein", version: 1, route: "workflow" as const },
  };
  it("keeps a long image prompt whole", () => {
    const long = `A lamp. ${"Every detail matters. ".repeat(450)}End mark.`;
    const plan = approvalPlan(image(long), imageQuote);
    expect(long.length).toBeGreaterThan(9000);
    expect(plan.description.endsWith("End mark.")).toBe(true);
  });
  it("shows the image output shape", () => {
    const plan = approvalPlan(image("A lamp."), imageQuote);
    expect(plan.resolution).toBe("1.5k");
    expect(plan.aspectRatio).toBe("9:16");
    const line = planLine({
      quoteId: "q",
      status: "pending",
      plan,
      estimateUsd: 0.1,
      expiresAt: quote.expiresAt,
      payer: "server",
    } as never);
    expect(line).toContain("9:16");
    expect(line).toContain("1.5k");
  });
  it("renders a long prompt expandable, with all of its text", () => {
    const long = `A lamp. ${"Every detail matters. ".repeat(40)}End mark.`;
    const html = renderToStaticMarkup(
      createElement(ApprovalPrompt, { text: long }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("Show the full prompt");
    expect(html).toContain("End mark.");
    const short = renderToStaticMarkup(
      createElement(ApprovalPrompt, { text: "A lamp." }),
    );
    expect(short).not.toContain("<details");
  });
});
