// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";
import type { SetupRunner } from "../shared/agent-runner-setting";
// Cold dynamic imports include the studio; leave headroom on busy test hosts.
vi.setConfig({ testTimeout: 20_000 });
vi.mock("../src/deck/TerminalVisualiser", () => ({ default: () => null }));

let root: Root;
let host: HTMLDivElement;
let available: boolean;
let fixed: boolean;
let settings: Promise<Response> | undefined;
let runner: "hermes" | "claude";
const session = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "starting",
  prompt: "Build a room",
  startedAt: "2026-10-30T12:00:00Z",
  lines: [],
};
const server = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/health") return Response.json({ hosted: fixed });
  if (url === "/api/settings/run-location")
    return settings ?? Response.json({ ...HOSTED_RUN_LOCATION, fixed });
  if (url === "/api/keys") return Response.json({ keys: { keychain: false } });
  if (url === "/api/agent/runners")
    return Response.json({ runners: [{ id: "hermes", installed: true }] });
  if (url === "/api/agent/status" || url === "/api/runner/status")
    return Response.json({
      available,
      paired: available,
      ...(available ? { runner } : {}),
      message: "Pair a local runner, or start the paired local studio.",
    });
  if (url === "/api/runner/pair" && init?.method === "POST")
    return Response.json({ id: crypto.randomUUID(), code: "a".repeat(64) });
  if (url === "/api/settings/agent-runner")
    return Response.json({ saved: { runner: "hermes" }, environment: false });
  if (url === "/api/agent/sign-in")
    return Response.json({
      harnesses: [{ runner: "hermes", installed: true, signedIn: true }],
    });
  if (url === "/api/agent/sessions" && init?.method === "POST")
    return Response.json(session, { status: 201 });
  if (url === "/api/agent/sessions") return Response.json({ session: null });
  if (url === "/api/voice/status")
    return Response.json({ available: false, maxSeconds: 0 });
  if (url === "/api/activity")
    return Response.json({ enabled: false, events: [] });
  throw new Error(`Unexpected request ${url}`);
});
const starts = () =>
  server.mock.calls.filter(
    ([url, init]) => url === "/api/agent/sessions" && init?.method === "POST",
  );

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", server);
  server.mockClear();
  available = false;
  fixed = true;
  settings = undefined;
  runner = "hermes";
  localStorage.clear();
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(node: ReactNode) {
  await act(async () => root.render(node));
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
it("setup never silently starts a different paired agent", async () => {
  available = true;
  runner = "claude";
  const { HostedAgentPairing } =
    await import("../src/agent/HostedAgentPairing");
  await mount(<HostedAgentPairing runner="hermes" />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "The paired studio runs Claude Code",
  );
  expect(host.textContent).not.toContain("Start paired runner");
  expect(starts()).toHaveLength(0);
  await mount(<HostedAgentPairing runner="codex" />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Codex cannot run studio sessions yet",
  );
  expect(host.textContent).not.toContain("Choose Codex in local setup");
  expect(host.textContent).not.toContain("Start paired runner");
});

it.each(["hermes", "claude", "codex"])(
  "hosted setup choosing %s goes straight to pairing",
  async (runner) => {
    const { CONNECT_STEP } = await import("../src/setup/SetupChoices");
    const { keepSetupSession } = await import("../src/setup/session-draft");
    keepSetupSession({
      step: CONNECT_STEP,
      draft: {
        selection: { agent: runner as SetupRunner, execution: "cloud" },
      },
    });
    const { default: StartupConfigurator } =
      await import("../src/setup/StartupConfigurator");
    await mount(<StartupConfigurator />);
    const name = { hermes: "Hermes", claude: "Claude Code", codex: "Codex" }[
      runner
    ];
    expect(host.textContent).toContain(
      `Connect your local Genobi to run ${name} on your machine`,
    );
    expect(
      host.querySelector('a[href="http://127.0.0.1:4317"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('a[href$="README.md#run-locally"]'),
    ).not.toBeNull();
    if (runner === "codex")
      expect(host.textContent).toContain("Codex works with the Genobi plugin");
    await click("Create pairing code");
    const code = host.querySelector<HTMLTextAreaElement>("textarea[readonly]")!;
    expect(JSON.parse(code.value)).toMatchObject({
      origin: window.location.origin,
      code: "a".repeat(64),
    });
    expect(host.textContent).toContain("within 10 minutes");
    await click("Continue ↗");
    expect(host.textContent).toContain(
      `Connect your local Genobi to run ${name} on your machine`,
    );
    expect(starts()).toHaveLength(0);
    expect(
      server.mock.calls.some(
        ([url]) =>
          url === "/api/agent/sign-in" ||
          url === "/api/settings/agent-runner" ||
          url === "/api/keys" ||
          url === "/api/agent/runners" ||
          url === "/api/projects",
      ),
    ).toBe(false);
  },
);

it("cloud generation setup can continue and connect its provider without pairing", async () => {
  const { CONNECT_STEP } = await import("../src/setup/SetupChoices");
  const { keepSetupSession } = await import("../src/setup/session-draft");
  keepSetupSession({
    step: CONNECT_STEP,
    draft: { selection: { agent: "any", execution: "cloud" } },
  });
  const { OPEN_CONNECTION } = await import("../src/setup/state");
  const connected = vi.fn();
  window.addEventListener(OPEN_CONNECTION, connected);
  const { default: StartupConfigurator } =
    await import("../src/setup/StartupConfigurator");
  await mount(<StartupConfigurator />);
  expect(host.textContent).not.toContain("Create pairing code");
  await click("Continue ↗");
  await click("Save & connect provider");
  expect(connected).toHaveBeenCalledOnce();
  window.removeEventListener(OPEN_CONNECTION, connected);
  expect(starts()).toHaveLength(0);
});

it("Connect waits for detection, then preserves confirmed-local setup and saving", async () => {
  let resolve!: (response: Response) => void;
  settings = new Promise<Response>((done) => {
    resolve = done;
  });
  const { default: SetupConnect } = await import("../src/setup/SetupConnect");
  const next = vi.fn();
  await mount(
    <SetupConnect draft={{ selection: { agent: "hermes" } }} next={next} />,
  );
  expect(host.textContent).toContain("Checking studio connection");
  expect(server.mock.calls.map(([url]) => url)).toEqual([
    "/api/settings/run-location",
  ]);
  await act(async () =>
    resolve(Response.json({ ...HOSTED_RUN_LOCATION, fixed: false })),
  );
  expect(host.textContent).toContain("Check sign-in again");
  expect(host.textContent).not.toContain("Create pairing code");
  expect(server.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining([
      "/api/keys",
      "/api/agent/runners",
      "/api/settings/agent-runner",
      "/api/agent/sign-in",
    ]),
  );
  await click("Continue ↗");
  const saved = server.mock.calls.find(
    ([url, init]) =>
      url === "/api/settings/agent-runner" && init?.method === "POST",
  );
  expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({
    runner: "hermes",
  });
  expect(next).toHaveBeenCalledOnce();
});

it.each(["failed", "invalid"])(
  "Connect can retry a %s detection and shares the recovered hosted answer",
  async (failure) => {
    settings =
      failure === "failed"
        ? Promise.resolve(new Response(null, { status: 503 }))
        : Promise.resolve(Response.json({}));
    const { default: SetupConnect } = await import("../src/setup/SetupConnect");
    const { useHostedStudioState, readHostedStudio } =
      await import("../src/hosted-studio");
    function Observer() {
      const hosted = useHostedStudioState();
      return <output>{String(hosted)}</output>;
    }
    const next = vi.fn();
    await mount(
      <>
        <Observer />
        <SetupConnect draft={{ selection: { agent: "hermes" } }} next={next} />
      </>,
    );
    expect(host.textContent).not.toContain("Checking studio connection");
    expect(host.textContent).toContain("Could not check the studio connection");
    await click("Retry");
    // Failed again: still actionable, rather than caching failure forever.
    expect(host.textContent).toContain("Could not check the studio connection");
    settings = undefined;
    await click("Retry");
    expect(host.querySelector("output")!.textContent).toBe("true");
    expect(await readHostedStudio()).toBe(true);
    expect(
      server.mock.calls.filter(([url]) => url === "/api/settings/run-location"),
    ).toHaveLength(3);
    expect(host.textContent).toContain("Create pairing code");
    expect(
      server.mock.calls.some(([url]) => url === "/api/settings/agent-runner"),
    ).toBe(false);
    await click("Continue ↗");
    expect(next).toHaveBeenCalledOnce();
  },
);

it("Connect lets a failed detection continue through local setup to the agent check", async () => {
  settings = Promise.resolve(new Response(null, { status: 503 }));
  const { CONNECT_STEP } = await import("../src/setup/SetupChoices");
  const { keepSetupSession } = await import("../src/setup/session-draft");
  keepSetupSession({
    step: CONNECT_STEP,
    draft: { selection: { agent: "hermes" } },
  });
  const { default: StartupConfigurator } =
    await import("../src/setup/StartupConfigurator");
  await mount(<StartupConfigurator />);
  await click("Continue with local setup");
  expect(host.textContent).toContain("Check sign-in again");
  await click("Continue ↗");
  expect(server.mock.calls.map(([url]) => url)).toContain("/api/agent/status");
  expect(host.textContent).not.toContain("Checking your agent");
});
