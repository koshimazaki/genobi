// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { approvalPlan, type AgentApproval } from "../shared/agent-approval";
import type { AgentSession } from "../shared/agent-session";
import type { Quote } from "../shared/quote";
import { AgentApprovals } from "../src/agent/AgentApprovals";
import { resetRecoveriesForTests } from "../src/agent/approval-recovery";
import { resetHandoffsForTests } from "../src/agent/approved-jobs";
import { useSettingsStore } from "../src/settings-store";
import { validateInput } from "../server/validation";
import { input } from "./server-harness";

const quote: Quote = {
  id: "b2027262-bbdb-42e0-ab80-5db019b29b3f",
  estimateUsd: 0,
  billing: "The registered deployment workspace pays for GPU time.",
  recipe: {
    id: "ltx-deploy-layout-to-video",
    version: 1,
    route: "workflow",
    location: "deployment",
    workflow: "world-builder-l2r-a2v",
    deployment: {
      name: "approved-room",
      url: "https://approved-room.run.comfy.app",
    },
  },
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
};
const pending = (): AgentApproval => ({
  quoteId: quote.id,
  status: "pending",
  plan: approvalPlan(
    validateInput({
      ...input,
      model: "ltx-deploy-layout-to-video",
      duration: 8,
      aspectRatio: "16:9",
      resolution: "hd",
      draft: false,
      deploy: { seed: 0, negativePrompt: "", assets: {} },
    }),
    quote,
  ),
  estimateUsd: quote.estimateUsd,
  expiresAt: quote.expiresAt,
  payer: "owner",
});
const session = (approval: AgentApproval): AgentSession => ({
  id: "deployment-approval-view",
  runner: "claude",
  status: "waiting",
  prompt: "Make the room shot.",
  startedAt: new Date().toISOString(),
  lines: [],
  approvals: [approval],
});
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useSettingsStore.setState({
    location: "deployment",
    workflows: { "ltx-deploy-layout-to-video": "world-builder-l2r-a2v" },
    restoring: false,
    saving: {},
    held: {},
  });
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  resetRecoveriesForTests();
  resetHandoffsForTests();
  useSettingsStore.setState({
    location: undefined,
    workflows: {},
    saving: {},
    held: {},
  });
  vi.unstubAllGlobals();
});

function mount(approval: AgentApproval) {
  function Harness() {
    const [current, setCurrent] = useState(session(approval));
    return <AgentApprovals session={current} onChange={setCurrent} />;
  }
  act(() => root!.render(<Harness />));
}

it("shows the deployment's metered terms before a single explicit approval", async () => {
  const approval = pending();
  const request = vi.fn(async () =>
    Response.json({
      session: session({ ...approval, status: "started", jobId: "room-run" }),
      job: { id: "room-run" },
    }),
  );
  vi.stubGlobal("fetch", request);
  mount(approval);
  expect(host.textContent).toContain(quote.billing);
  expect(host.textContent).toContain(quote.recipe.deployment!.url);
  expect(host.textContent).toContain("Comfy deployment approved-room");
  expect(host.textContent).toContain("No fixed price or cost cap.");
  expect(host.textContent).toContain("Your saved key");
  expect(host.textContent).not.toContain("$0.00");
  expect(request).not.toHaveBeenCalled();
  const approve = host.querySelector<HTMLButtonElement>(".agent-approve")!;
  expect(approve.textContent).toBe("Approve paid GPU time");
  await act(async () => approve.click());
  expect(request).toHaveBeenCalledExactlyOnceWith(
    `/api/agent/sessions/deployment-approval-view/approvals/${quote.id}/approve`,
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Genobi-Run-Location": "deployment",
        "Genobi-Workflow": "world-builder-l2r-a2v",
        "Idempotency-Key": expect.stringMatching(/^[a-f0-9-]{36}$/),
      }),
    }),
  );
  expect(host.textContent).toContain("The run started");
  expect(host.querySelector(".agent-approve")).toBeNull();
});

it("keeps metered approval held while settings are changing", () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  useSettingsStore.setState({ saving: { "run-location": true } });
  mount(pending());
  const approve = host.querySelector<HTMLButtonElement>(".agent-approve")!;
  expect(approve.disabled).toBe(true);
  expect(approve.textContent).toBe("Approve paid GPU time");
  act(() => approve.click());
  expect(request).not.toHaveBeenCalled();
});

it("does not present a deployment as free when an older plan omits billing details", () => {
  const approval = pending();
  delete approval.plan.billing;
  delete approval.plan.deployment;
  mount(approval);
  expect(host.textContent).toContain("Comfy deployment GPU time");
  expect(host.textContent).toContain("No fixed price or cost cap.");
  expect(host.textContent).not.toContain("$0.00");
  expect(host.querySelector(".agent-approve")?.textContent).toBe(
    "Approve paid GPU time",
  );
});
