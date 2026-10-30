import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SpawnAgentView } from "../src/agent/SpawnAgentDialog";
import { HostedRunnerRequired, spawnAgent } from "../src/agent/spawn";

const request = {
  prompt: "Cut the drop",
  source: "typed" as const,
  projectId: "genobi-teaser",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("offers pairing for an unpaired hosted runner without reading local setup", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ available: false, paired: false }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(spawnAgent(request)).rejects.toBeInstanceOf(
    HostedRunnerRequired,
  );
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith("/api/agent/status", expect.anything());
  const html = renderToStaticMarkup(
    <SpawnAgentView
      step={{ kind: "pairing", text: "Pair your local studio." }}
      onChoose={() => {}}
      onSignIn={() => {}}
      onCheck={() => {}}
      onMode={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain("Pair hosted and local Genobi");
  expect(html).toContain("Set up the local studio");
  expect(html).toContain('href="http://127.0.0.1:4317"');
  expect(html).toContain("Open local studio");
  expect(html).toContain("npm run dev");
});

it("starts a paired hosted runner without local settings, sign-in or project lookups", async () => {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (path === "/api/agent/status")
        return Response.json({
          available: true,
          paired: true,
          runner: "hermes",
        });
      expect(path).toBe("/api/agent/sessions");
      const body = JSON.parse(String(init?.body));
      expect(body.copyId).toBeUndefined();
      expect(body.mode).toBeUndefined();
      return Response.json({
        id: "11111111-1111-4111-8111-111111111111",
        status: "running",
        runner: "hermes",
        lines: [],
      });
    }),
  );
  await spawnAgent(request);
  expect(paths).toEqual(["/api/agent/status", "/api/agent/sessions"]);
});

it.each(["/api/agent/status", "/api/settings/agent-runner"])(
  "bounds a stalled %s read and never starts a session",
  async (stalled) => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let reached!: () => void;
    const pending = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init?: RequestInit) => {
        paths.push(path);
        if (path !== stalled)
          return Promise.resolve(
            Response.json({ available: true, runner: "hermes" }),
          );
        reached();
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        );
      }),
    );
    const spawning = spawnAgent(request);
    const refused = expect(spawning).rejects.toThrow("timed out");
    await pending;
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    await refused;
    expect(paths).not.toContain("/api/agent/sessions");
  },
);
