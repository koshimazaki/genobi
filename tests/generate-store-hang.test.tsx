// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GenerateInput, Job } from "../shared/types";
import { runInputStore } from "../src/run-inputs";
import { useJobs } from "../src/useJobs";

vi.mock("../src/activity/jobs", () => ({ recordJobActivity: vi.fn() }));
vi.mock("../src/agent/approved-jobs", () => ({
  handOffApprovedJob: vi.fn(),
  onApprovedJob: vi.fn(() => () => {}),
  retryPendingHandoffs: vi.fn(),
}));

const job = {
  id: "paid",
  status: "queued",
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tree",
} as unknown as Job;
let root: Root;
let jobs: ReturnType<typeof useJobs>;
function Probe() {
  jobs = useJobs("");
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ job, jobs: [], sources: [] })),
  );
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("returns the accepted paid run even when browser storage never settles", async () => {
  // A Safari IndexedDB open can hang forever; the submit must not wait on it.
  const save = vi
    .spyOn(runInputStore, "save")
    .mockReturnValue(new Promise<boolean>(() => {}));
  let started: Job | undefined;
  await act(async () => {
    started = await jobs.generate({
      generator: "image",
      model: "flux-3-klein-api",
      description: "A tree",
    } as GenerateInput);
  });
  expect(started?.id).toBe("paid");
  expect(save).toHaveBeenCalledOnce();
  expect(jobs.jobs.map((j) => j.id)).toContain("paid");
  expect(jobs.error).toBe("");
});

it("still reports a tab-only fallback when the background save fails", async () => {
  vi.spyOn(runInputStore, "save").mockResolvedValue(false);
  await act(async () => {
    await jobs.generate({
      generator: "image",
      model: "flux-3-klein-api",
      description: "A tree",
    } as GenerateInput);
  });
  expect(jobs.error).toMatch(/only be kept in this tab/);
});
