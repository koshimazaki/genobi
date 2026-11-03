// @vitest-environment jsdom
// Paid-step approvals moved from the bubble to the footer deck (#57): a
// pending step must be visible and actionable there, and the deck must open
// by itself when one waits, so a voice-driven flow never dead-ends.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentApproval } from "../shared/agent-approval";
import type { AgentSession } from "../shared/agent-session";

const api = vi.hoisted(() => ({
  approveStep: vi.fn(),
  declineStep: vi.fn(),
  stopAgentSession: vi.fn(),
}));
vi.mock("../src/agent/api", async (original) => ({
  ...(await original<object>()),
  approveStep: api.approveStep,
  declineStep: api.declineStep,
  stopAgentSession: api.stopAgentSession,
}));

import GenobiDeck from "../src/deck/GenobiDeck";
import { GenobiGuide } from "../src/agent/GenobiGuide";
import {
  closeAgentSession,
  showAgentSession,
} from "../src/agent/useAgentSession";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const step = (): AgentApproval => ({
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
});
const session = (): AgentSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "waiting",
  prompt: "Make the vessel shot",
  startedAt: "2026-11-02T12:00:00Z",
  lines: ["Quoted one FLUX 3 shot"],
  approvals: [step()],
});

let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ open: false, program: "rain" }),
    setItem: () => {},
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  closeAgentSession();
  host.remove();
  vi.unstubAllGlobals();
});

it("opens the deck on a waiting approval and the Approve click reaches the approval API", async () => {
  api.approveStep.mockResolvedValue({ ...session(), approvals: [] });
  showAgentSession(session());
  const root = createRoot(host);
  await act(async () => root.render(<GenobiDeck />));
  expect(host.querySelector(".deck-body")).not.toBeNull();
  const approve = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Approve $0.85"),
  );
  expect(approve).toBeDefined();
  expect(host.textContent).toContain("Decline");
  expect(host.textContent).toContain("FLUX 3 · Video");
  await act(async () => approve!.click());
  await vi.waitFor(() => expect(api.approveStep).toHaveBeenCalledOnce());
  expect(api.approveStep.mock.calls[0][0]).toBe(session().id);
  expect(api.approveStep.mock.calls[0][1]).toBe(step().quoteId);
  act(() => root.unmount());
});

it("the guide bubble says an approval waits and points to it", async () => {
  showAgentSession(session());
  const root = createRoot(host);
  await act(async () => root.render(<GenobiGuide defaultOpen />));
  expect(host.textContent).toContain("Approval waiting");
  expect(host.textContent).toContain("Review approval");
  act(() => root.unmount());
});
