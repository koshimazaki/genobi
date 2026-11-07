// The session bubble's paid steps (issue #23, "Confirm before spending"):
// what it will run, the price and the payer, with Approve and Decline only
// while the quote is open.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentApproval } from "../shared/agent-approval";
import type { AgentSession } from "../shared/agent-session";
import { AgentApprovals, planLine } from "../src/agent/AgentApprovals";
import { approvalPlan } from "../shared/agent-approval";
import { CLOUD_GPU_ESTIMATE, CLOUD_UNCHECKED } from "../shared/quote";
import { input } from "./server-harness";

const step = (extra: Partial<AgentApproval> = {}): AgentApproval => ({
  quoteId: "0f6c3c2e-6b1a-4f0e-9a43-3d7b0f3c9a11",
  status: "pending",
  plan: {
    entry: "flux-3-video",
    label: "FLUX 3 · Video",
    generator: "video",
    model: "flux-3",
    description: "A ceramic vessel.",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "hd",
    draft: false,
    route: "bfl",
  },
  estimateUsd: 0.85,
  expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  payer: "server",
  ...extra,
});
const session = (approvals: AgentApproval[]): AgentSession => ({
  id: "s",
  runner: "claude",
  status: "waiting",
  prompt: "Make the vessel shot",
  startedAt: "2026-10-22T12:00:00Z",
  lines: [],
  approvals,
});
const html = (approvals: AgentApproval[]) =>
  renderToStaticMarkup(
    <AgentApprovals session={session(approvals)} onChange={() => {}} />,
  );

describe("the paid steps in the session bubble", () => {
  it("shows the plan, the price and whose key pays, with Approve and Decline", () => {
    const out = html([step()]);
    expect(planLine(step())).toBe("FLUX 3 · Video · 5 s, 16:9, hd · BFL");
    expect(out).toContain("Waiting for your approval");
    expect(out).toContain("FLUX 3 · Video · 5 s, 16:9, hd · BFL");
    expect(out).toContain("A ceramic vessel.");
    expect(out).toContain("$0.85");
    expect(out).toContain("The studio&#x27;s demo key");
    expect(out).toContain("Approve $0.85");
    expect(out).toContain("Decline");
    expect(out).toMatch(/Quote valid<\/dt><dd>(8:5\d|9:00)<\/dd>/);
  });

  it("names a workflow's run location and the owner's key", () => {
    const local = step({
      payer: "local",
      plan: { ...step().plan, route: "workflow", location: "local" },
    });
    expect(planLine(local)).toContain("this machine's ComfyUI");
    expect(html([local])).toContain("Nobody: this machine&#x27;s ComfyUI");
  });

  it("carries Cloud uncertainty and GPU-time pricing from quote to approval", () => {
    const base = step();
    const plan = approvalPlan(
      {
        ...input,
        generator: "video",
        resolution: "hd",
        presetId: "orbit_l",
        aspectRatio: "16:9",
        upscaleCreativity: 0,
      },
      {
        id: base.quoteId,
        estimateUsd: base.estimateUsd,
        expiresAt: base.expiresAt,
        recipe: {
          id: "ltx-2-5-open",
          version: 1,
          route: "workflow",
          location: "cloud",
        },
        availability: CLOUD_UNCHECKED,
        estimateNote: CLOUD_GPU_ESTIMATE,
      },
    );
    const out = html([step({ plan, payer: "owner" })]);
    expect(out).toContain("Couldn&#x27;t check Cloud availability");
    expect(out).toContain(CLOUD_GPU_ESTIMATE);
  });

  it("offers no Approve once a step expired or closed", () => {
    const expired = step({ expiresAt: new Date(Date.now() - 1).toISOString() });
    const out = html([
      expired,
      step({ quoteId: "b", status: "declined" }),
      step({ quoteId: "c", status: "refused", message: "Quote again." }),
      step({ quoteId: "d", status: "started", jobId: "job-1" }),
    ]);
    expect(out).not.toContain("Approve $");
    expect(out).toContain("The quote expired. Nothing ran.");
    expect(out).toContain("Declined. Nothing ran.");
    expect(out).toContain("Not run. Quote again.");
    expect(out).toContain("The run started; it is in your gallery.");
  });

  it("renders nothing without steps", () => {
    expect(html([])).toBe("");
  });
});
