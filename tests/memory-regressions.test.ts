import { describe, expect, it } from "vitest";
import { memoryHarness } from "./memory-harness";
import { MemoryProjects } from "../server/memory-projects";
import { MAX_EVENTS, projectGuidance } from "../shared/memory/state";

class FullHistory extends MemoryProjects {
  seedLimit(copyId: string, operational = false) {
    return this.run(async () => {
      const r = structuredClone(this.readable(copyId, "owner"));
      const first = r.memory!.events[0];
      r.memory!.events = Array.from({ length: MAX_EVENTS }, (_, i) => ({
        ...first,
        operational,
        id: `event-${i}`,
        cursor: i + 1,
      }));
      r.memory!.cursor = MAX_EVENTS;
      await this.save(r);
    });
  }
}
describe("review regressions", () => {
  it("removing a reference preserves supersession and rerun links", async () => {
    const h = await memoryHarness();
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("old", {
        kind: "preference",
        guidance: { topic: "pacing", value: "fast" },
      }),
      "owner",
    );
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("new", {
        kind: "preference",
        guidance: { topic: "pacing", value: "slow" },
        supersedes: "old",
      }),
      "owner",
    );
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("rerun", {
        kind: "rerun",
        priorAttempt: "old",
        supersedes: "new",
      }),
      "owner",
    );
    await h.projects.reference(h.copyId, "owner", {
      id: "ref",
      baseRevision: 1,
      memoryRevision: h.context().memoryRevision,
      url: "https://example.org",
      purpose: "motion",
      observation: "Orbit",
    });
    const before = h.projects.exportMemory(h.copyId, "owner").events;
    await h.projects.forget(
      h.copyId,
      "owner",
      h.context().memoryRevision,
      undefined,
      "ref",
    );
    expect(h.projects.exportMemory(h.copyId, "owner").events).toEqual(before);
    await h.projects.forget(
      h.copyId,
      "owner",
      h.context().memoryRevision,
      "new",
    );
    expect(
      h.projects
        .exportMemory(h.copyId, "owner")
        .events.find((e) => e.id === "rerun"),
    ).toMatchObject({ priorAttempt: "old" });
  });
  it("surfaces the history cap as an actionable conflict and preserves the project", async () => {
    const h = await memoryHarness();
    const projects = new FullHistory(h.directory);
    await projects.load();
    await projects.seedLimit(h.copyId);
    await expect(
      projects.command(h.copyId, "owner", {
        baseRevision: 1,
        command: { op: "set-prompt", text: "new" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Export and clear"),
    });
    expect(projects.read(h.copyId, "owner").revision).toBe(1);
    expect(
      projectGuidance(projects.exportMemory(h.copyId, "owner").events),
    ).toEqual([]);
  });
  it("rolls the oldest operational events over instead of blocking saves", async () => {
    const h = await memoryHarness();
    const projects = new FullHistory(h.directory);
    await projects.load();
    await projects.seedLimit(h.copyId, true);
    await projects.command(h.copyId, "owner", {
      baseRevision: 1,
      command: { op: "set-prompt", text: "new" },
    });
    const events = projects.exportMemory(h.copyId, "owner").events;
    expect(projects.read(h.copyId, "owner").revision).toBe(2);
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events.some((e) => e.id === "event-0")).toBe(false);
  });
  it("forgetting one event keeps the running session usable", async () => {
    const h = await memoryHarness();
    await h.projects.beginSession(h.copyId, "owner", {
      id: "run",
      runner: "codex",
      goal: "Edit",
    });
    await h.projects.decide(h.copyId, "owner", h.decision("one"), "owner");
    await h.projects.forget(
      h.copyId,
      "owner",
      h.context().memoryRevision,
      "one",
    );
    const sessions = h.projects.exportMemory(h.copyId, "owner").sessions;
    expect(sessions).toEqual([expect.objectContaining({ id: "run" })]);
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("two", { source: "interpretation" }),
      "agent",
      "run",
    );
  });
  it("an owner edit can clear a preference's supersession", async () => {
    const h = await memoryHarness();
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("evidence", {
        kind: "preference",
        guidance: { topic: "pacing", value: "slow" },
      }),
      "owner",
    );
    const pref = (id: string, extra: object = {}) => ({
      id,
      topic: "pacing",
      value: id,
      scope: { medium: "video", useCase: "tutorial" },
      evidence: [{ copyId: h.copyId, eventId: "evidence" }],
      ...extra,
    });
    await h.profiles.propose(h.copyId, "owner", 0, pref("old"));
    await h.profiles.propose(
      h.copyId,
      "owner",
      1,
      pref("new", { supersedes: "old" }),
    );
    await h.profiles.manage("owner", 2, "new", "activate", pref("new"));
    const held = (await h.profiles.read("owner")).preferences.find(
      (p) => p.id === "new",
    );
    expect(held).not.toHaveProperty("supersedes");
  });
  it("rejects references to inherited asset keys", async () => {
    const h = await memoryHarness();
    await expect(
      h.projects.reference(h.copyId, "owner", {
        id: "ref",
        baseRevision: 1,
        memoryRevision: h.context().memoryRevision,
        assetId: "constructor",
        purpose: "motion",
        observation: "Orbit",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("asset was not found"),
    });
  });
});
