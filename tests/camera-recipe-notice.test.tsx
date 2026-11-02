// @vitest-environment jsdom
// A Recreate in Camera note is a neutral status, never an error alert; and a
// paid step waiting behind the Make my version modal is said inside it.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ComposerAlerts from "../src/components/ComposerAlerts";
import {
  applyCameraRecipe,
  setCameraNotice,
} from "../src/camera-recipe-target";
import { useComposerRecreate } from "../src/useComposerRecreate";
import { initialComposer } from "../src/useComposer";
import { ApprovalWaitingNotice } from "../src/agent/ApprovalWaitingNotice";
import {
  OPEN_DECK,
  closeAgentSession,
  showAgentSession,
} from "../src/agent/useAgentSession";
import type { AgentSession } from "../shared/agent-session";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  setCameraNotice("");
  closeAgentSession();
  host.remove();
});

it("routes a recipe's note to a status line, not the error alert", async () => {
  const update = vi.fn();
  function Composer() {
    const [error, setError] = useState("An earlier failure");
    useComposerRecreate(initialComposer, () => {}, setError, update);
    return (
      <ComposerAlerts
        error={error}
        onDismiss={() => setError("")}
        needsKey={false}
        onConnectKey={() => {}}
      />
    );
  }
  const root = createRoot(host);
  await act(async () => root.render(<Composer />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => {
    applyCameraRecipe({
      patch: { description: "a fox" },
      note: "Restored this asset's prompt and model. Nothing was generated.",
    });
  });
  expect(update).toHaveBeenCalledWith({ description: "a fox" });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  const status = host.querySelector('[role="status"]');
  expect(status?.textContent).toContain("Restored this asset's prompt");
  const dismiss = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Dismiss notice"]',
  )!;
  await act(async () => dismiss.click());
  expect(host.querySelector('[role="status"]')).toBeNull();
  act(() => root.unmount());
});

it("says a waiting paid step inside the modal and closes onto the deck", async () => {
  const session: AgentSession = {
    id: "11111111-1111-4111-8111-111111111111",
    runner: "claude",
    status: "waiting",
    prompt: "Make the vessel shot",
    startedAt: "2026-11-02T12:00:00Z",
    lines: [],
    approvals: [
      {
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
      },
    ],
  };
  const close = vi.fn();
  const opened = vi.fn();
  window.addEventListener(OPEN_DECK, opened);
  const root = createRoot(host);
  await act(async () => root.render(<ApprovalWaitingNotice close={close} />));
  expect(host.textContent).toBe("");
  await act(async () => showAgentSession(session));
  expect(host.textContent).toContain("waiting for your approval");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(opened).toHaveBeenCalledOnce();
  window.removeEventListener(OPEN_DECK, opened);
  act(() => root.unmount());
});
