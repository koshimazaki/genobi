// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GenerateInput, Job } from "../shared/types";
import type { ComposerState } from "../src/useComposer";
import GenerateAction from "../src/components/GenerateAction";
import { runInputStore } from "../src/run-inputs";
import { useCameraQueue } from "../src/useGenerationQueue";
import { useJobs } from "../src/useJobs";

// Camera's Generate while a run is in flight: every click is its own paid
// submission with its own Idempotency-Key, and an uncertain one halts the
// queue without a retry. Fetch is stubbed; nothing reaches a provider.
vi.mock("../src/activity/jobs", () => ({ recordJobActivity: vi.fn() }));
vi.mock("../src/agent/approved-jobs", () => ({
  handOffApprovedJob: vi.fn(),
  onApprovedJob: vi.fn(() => () => {}),
  retryPendingHandoffs: vi.fn(),
}));
vi.mock("../src/settings-store", async (actual) => ({
  ...(await actual<typeof import("../src/settings-store")>()),
  loadSettings: () => {},
  useSettingsHold: () => null,
}));

const composer = {
  generator: "image",
  model: "flux-3-klein-api",
} as ComposerState;
const input = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tree",
} as GenerateInput;
const jobOf = (id: string) =>
  ({ ...input, id, status: "Pending", keyMode: "server" }) as unknown as Job;

let root: Root;
let container: HTMLDivElement;
let posts: Headers[];
let answers: ((n: number) => Promise<Response>)[];
let accepted: Job[];
let note = "";

function Probe() {
  const jobs = useJobs("");
  note = jobs.error;
  const queue = useCameraQueue("", jobs.generate, jobs.setError);
  const submit = () => queue.add({ input, composer });
  return (
    <GenerateAction
      state={composer}
      jobs={jobs.jobs}
      submitting={queue.submitting}
      hasKey={false}
      recreating={false}
      disabled={false}
      onSubmit={submit}
      onResume={() => {}}
      onUpdate={() => {}}
      queued={queue.queued}
      onClearQueue={queue.clear}
    />
  );
}

const button = () =>
  container.querySelector<HTMLButtonElement>(".generate-button")!;
const click = (target: HTMLElement) =>
  act(async () => {
    target.click();
  });

beforeEach(async () => {
  posts = [];
  accepted = [];
  history.replaceState(null, "", "/");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(runInputStore, "save").mockResolvedValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/jobs" && init?.method === "POST") {
        posts.push(new Headers(init.headers));
        return answers[posts.length - 1](posts.length);
      }
      const id = url.match(/^\/api\/jobs\/([^?]+)/)?.[1];
      const job = accepted.find((j) => j.id === id);
      if (job) return Response.json({ job });
      if (id) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ jobs: accepted, sources: [] });
    }),
  );
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const accept = async (n: number) => {
  const job = jobOf(`run-${n}`);
  accepted.push(job);
  return Response.json({ job });
};

it("sends a second click while a run is in flight as its own submission, and halts on an uncertain one", async () => {
  let fail!: (error: Error) => void;
  answers = [
    accept,
    () => new Promise<Response>((_, reject) => (fail = reject)),
  ];
  expect(button().textContent).toContain("Generate");
  await click(button());
  expect(posts).toHaveLength(1);
  // The first run is in flight: Generate now adds to the queue.
  expect(button().disabled).toBe(false);
  expect(button().textContent).toContain("Add to queue");
  await click(button());
  expect(posts).toHaveLength(2);
  const keys = posts.map((headers) => headers.get("Idempotency-Key"));
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBeTruthy();
  expect(keys[0]).not.toBe(keys[1]);

  // Two more wait behind the second, whose answer never arrives.
  await click(button());
  await click(button());
  expect(posts).toHaveLength(2);
  expect(container.querySelector(".generate-queue")?.textContent).toBe("+2");

  await act(async () => fail(new TypeError("Failed to fetch")));
  // Not retried, and nothing behind it was sent.
  expect(posts).toHaveLength(2);
  expect(container.querySelector(".generate-queue")).toBeNull();
  expect(note).toMatch(/not retried/);
  expect(note).toMatch(/2 queued runs were not sent/);
});

it("clears the unsent runs when the badge is clicked", async () => {
  let accept2!: () => void;
  answers = [
    accept,
    (n) =>
      new Promise<Response>((resolve) => {
        accept2 = () => void accept(n).then(resolve);
      }),
  ];
  await click(button());
  await click(button());
  await click(button());
  const badge = container.querySelector<HTMLButtonElement>(".generate-queue")!;
  expect(badge.textContent).toBe("+1");
  await click(badge);
  expect(container.querySelector(".generate-queue")).toBeNull();
  await act(async () => accept2());
  // The run being sent was the server's; only the unsent one was dropped.
  expect(posts).toHaveLength(2);
  expect(note).not.toMatch(/queue|not sent/);
});
