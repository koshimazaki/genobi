import { describe, expect, it, vi } from "vitest";
import { AgentSessions } from "../server/agent-sessions";
import { MemoryProjects } from "../server/memory-projects";
import { TasteProfiles } from "../server/taste-profiles";
import { memoryHarness } from "./memory-harness";
import { fakeConfig, fakeHermesConfig } from "./agent-harness";
import type { LaunchPlan, RunnerHandlers } from "../server/agent-runner";

const text = (text: string) =>
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  });
describe("runner memory lifecycle", { timeout: 20_000 }, () => {
  it("loads shared context before launch, persists progress/finalization, and resumes after restart", async () => {
    const h = await memoryHarness();
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("keep", { reason: "Keep slow orbit" }),
      "owner",
    );
    let handlers: RunnerHandlers;
    let plan: LaunchPlan;
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4317",
      link: (id, owner) => h.projects.link(id.split(".")[0], owner),
      memory: { projects: h.projects, profiles: h.profiles },
      launch: (p, on) => {
        plan = p;
        handlers = on;
        return { pid: undefined };
      },
    });
    const started = await sessions.start("owner", {
      copyId: h.copyId,
      prompt: "Continue tutorial",
      source: "typed",
    });
    expect(plan!.args.join(" ")).toContain("Keep slow orbit");
    const beforeProgress = h.context();
    handlers!.line(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t",
              name: "mcp__genobi__genobi_context",
              input: {},
            },
          ],
        },
      }),
    );
    handlers!.line(text("Reading project evidence"));
    await vi.waitFor(() =>
      expect(h.context().sessions[0].progress).toBe("Reading project evidence"),
    );
    expect(h.context().memoryRevision).toBe(beforeProgress.memoryRevision);
    await h.projects.decide(
      h.copyId,
      "owner",
      {
        ...h.decision("mid-run", { source: "interpretation" }),
        memoryRevision: beforeProgress.memoryRevision,
      },
      "agent",
      started.id,
    );

    handlers!.line(text("Working on ending"));
    await vi.waitFor(() =>
      expect(h.context().sessions[0].progress).toBe("Working on ending"),
    );
    handlers!.line(
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "Ending prepared. Review it.",
      }),
    );
    handlers!.exit(0);
    await vi.waitFor(() => expect(h.context().sessions[0].status).toBe("done"));
    await sessions.close();
    const projects = new MemoryProjects(h.directory);
    await projects.load();
    const resumed = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4317",
      link: () => ({ code: "LINK2345" }),
      memory: { projects, profiles: new TasteProfiles(h.directory, projects) },
    });
    expect(resumed.read(started.id, "owner")).toMatchObject({
      status: "done",
      summary: "Ending prepared. Review it.",
    });
    expect(() => resumed.read(started.id, "another-owner")).toThrow();
    await resumed.close();
  });
  it("marks a session interrupted on shutdown and gives the next Hermes runner the same context", async () => {
    const h = await memoryHarness();
    const first = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4317",
      link: () => ({ code: "LINK2345" }),
      memory: { projects: h.projects, profiles: h.profiles },
      launch: () => ({ pid: undefined }),
    });
    const started = await first.start("owner", {
      copyId: h.copyId,
      prompt: "Find an ending",
      source: "typed",
    });
    await first.close();
    const projects = new MemoryProjects(h.directory);
    await projects.load();
    const profiles = new TasteProfiles(h.directory, projects);
    let plan: LaunchPlan;
    const next = new AgentSessions({
      config: await fakeHermesConfig(),
      studioOrigin: "http://127.0.0.1:4317",
      link: () => ({ code: "LINK2345" }),
      memory: { projects, profiles },
      launch: (p) => {
        plan = p;
        return { pid: undefined };
      },
    });
    expect(next.read(started.id, "owner").status).toBe("interrupted");
    await next.start("owner", {
      copyId: h.copyId,
      prompt: "Resume ending",
      source: "typed",
    });
    expect(plan!.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
      "Find an ending",
    );
    expect(plan!.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("interrupted");
    await next.close();
  });
});
