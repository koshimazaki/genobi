// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import UpscalePartsDialog from "../src/components/UpscalePartsDialog";
import { partsClient } from "../src/upscale-parts-client";
import { planParts, type PartSetView } from "../shared/upscale-parts";
import type { GenerateInput, Job } from "../shared/types";

vi.mock("../src/components/useModalDialog", () => ({ useModalDialog() {} }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("collects an unfinished part despite a failed sibling, then stops polling", async () => {
  const plan = planParts(555, 24);
  const set: PartSetView = {
    id: "set",
    sourceId: "mix",
    model: "flux-3",
    upscaleFactor: 2,
    upscaleCreativity: 0,
    partSeconds: 19,
    status: "failed",
    plan,
    parts: plan.parts.map((part, i) => ({
      ...part,
      sourceId: `cut-${i}`,
      job: {
        status: i ? "Pending" : "Error",
        error: i ? undefined : "Failed",
      } as Job,
    })),
    quoteId: "quote",
    estimateUsd: 2,
    expiresAt: "2026-10-30T00:00:00Z",
    confirmed: true,
  };
  const done = structuredClone(set);
  done.parts[1].job!.status = "Ready";
  vi.spyOn(partsClient, "plan").mockResolvedValue({ set });
  const read = vi.spyOn(partsClient, "read").mockResolvedValue({ set: done });
  const confirm = vi.spyOn(partsClient, "confirm");
  const retry = vi.spyOn(partsClient, "confirmRetry");
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <UpscalePartsDialog
        input={{ model: "flux-3" } as GenerateInput}
        apiKey=""
        onClose={() => {}}
        onJoined={() => {}}
      />,
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(read).toHaveBeenCalledWith("set", "");
  expect(host.textContent).toContain("Ready");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
});
