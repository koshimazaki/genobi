import { describe, expect, it } from "vitest";
import { stat } from "node:fs/promises";
import { MemoryProjects } from "../server/memory-projects";
import { TasteProfiles } from "../server/taste-profiles";
import { memoryHarness } from "./memory-harness";
import { resolveGuidance, projectGuidance } from "../shared/memory/state";
import { memoryContext } from "../shared/memory/context";
import { jsonBytes } from "../shared/director/feedback";
import { emptyMemory, type TastePreference } from "../shared/memory/schema";

describe("durable evidence and checkpoints", () => {
  it("stores an identical retry once, rejects conflicting IDs and stale/concurrent writes", async () => {
    const h = await memoryHarness();
    const input = h.decision("keep-orbit", {
      reason: "Slow orbit works for this tutorial",
    });
    const first = await h.projects.decide(h.copyId, "owner", input, "owner");
    expect(
      await h.projects.decide(
        h.copyId,
        "owner",
        Object.fromEntries(Object.entries(input).reverse()),
        "owner",
      ),
    ).toEqual(first);
    await expect(
      h.projects.decide(
        h.copyId,
        "owner",
        { ...input, reason: "Different" },
        "owner",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      h.projects.decide(h.copyId, "owner", { ...input, id: "new" }, "owner"),
    ).rejects.toMatchObject({ status: 409 });
    const input2 = h.decision("race-a");
    const race = await Promise.allSettled([
      h.projects.decide(h.copyId, "owner", input2, "owner"),
      h.projects.decide(
        h.copyId,
        "owner",
        { ...input2, id: "race-b" },
        "owner",
      ),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(h.context().decisions).toHaveLength(2);
  });
  it("resumes the same evidence and outstanding work after a server crash with another linked harness", async () => {
    const h = await memoryHarness();
    await h.link("hermes");
    await h.link("codex");
    await h.projects.beginSession(h.copyId, "hermes", {
      id: "session-hermes",
      runner: "hermes",
      goal: "Make a tutorial",
    });
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("keep", { reason: "Keep slow orbit" }),
      "owner",
    );
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("reject", {
        kind: "rejected",
        reason: "Fast cut is busy here",
      }),
      "owner",
    );
    const c = h.context();
    const checkpoint = {
      id: "cp-1",
      baseRevision: 1,
      memoryRevision: c.memoryRevision,
      sessionId: "session-hermes",
      coveredCursor: c.cursor,
      summary: "Slow orbit selected. Ending still needed.",
      eventIds: ["keep", "reject"],
      unresolved: ["Find ending"],
      nextSteps: ["Try a locked final shot"],
    };
    await h.projects.checkpoint(h.copyId, "hermes", checkpoint);
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("later", { kind: "note", reason: "Use a softer ending" }),
      "owner",
    );
    const restarted = new MemoryProjects(h.directory);
    await restarted.load();
    const resumed = restarted.context(h.copyId, "codex", [], {
      medium: "video",
      useCase: "tutorial",
    });
    expect(resumed.checkpoint).toMatchObject({
      unresolved: ["Find ending"],
      eventIds: ["keep", "reject"],
    });
    expect(resumed.sessions[0].status).toBe("interrupted");
    expect(resumed.sessions[0].summary).toBeUndefined();
    expect(resumed.events.map((e) => e.id)).toContain("later");
    expect(resumed.decisions.map((e) => e.id)).toEqual(["keep", "reject"]);
    await expect(
      restarted.checkpoint(h.copyId, "codex", checkpoint),
    ).rejects.toMatchObject({ status: 403 });
    expect(JSON.stringify(restarted.read(h.copyId, "codex"))).not.toContain(
      "Find ending",
    );
  });
  it("rejects late summaries and records every project revision without claiming taste", async () => {
    const h = await memoryHarness();
    await h.projects.beginSession(h.copyId, "owner", {
      id: "s",
      runner: "claude",
      goal: "Edit",
    });
    await h.projects.command(h.copyId, "owner", {
      baseRevision: 1,
      command: { op: "set-prompt", text: "A slow orbit" },
    });
    const c = h.context();
    expect(c.revision).toBe(2);
    expect(
      h.projects.exportMemory(h.copyId, "owner").events.at(-1),
    ).toMatchObject({ actor: "agent", operational: true });
    const cp = {
      id: "late",
      baseRevision: 1,
      memoryRevision: c.memoryRevision,
      sessionId: "s",
      coveredCursor: c.cursor,
      summary: "Old",
      eventIds: [],
      unresolved: [],
      nextSteps: [],
    };
    await expect(
      h.projects.checkpoint(h.copyId, "owner", cp),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      projectGuidance(h.projects.exportMemory(h.copyId, "owner").events),
    ).toEqual([]);
  });
  it("isolates owners and refuses agent impersonation", async () => {
    const h = await memoryHarness();
    await h.link("agent");
    expect(() =>
      h.projects.context(h.copyId, "stranger", [], {
        medium: "video",
        useCase: "tutorial",
      }),
    ).toThrow();
    await expect(
      h.projects.decide(h.copyId, "agent", h.decision("fake"), "agent"),
    ).rejects.toMatchObject({ status: 403 });
    await h.projects.decide(
      h.copyId,
      "agent",
      h.decision("proposal", {
        source: "interpretation",
        kind: "preference",
        guidance: { topic: "pacing", value: "slow" },
      }),
      "agent",
    );
    expect(
      projectGuidance(h.projects.exportMemory(h.copyId, "owner").events),
    ).toEqual([]);
  });
});

describe("scoped reusable taste", () => {
  it("requires explicit promotion, supports edits/disable/delete, and never learns a technical dislike", async () => {
    const h = await memoryHarness();
    await h.link("agent");
    for (const [id, kind] of [
      ["retry", "rerun"],
      ["undo", "undo"],
    ])
      await h.projects.decide(
        h.copyId,
        "owner",
        h.decision(id, {
          kind,
          reason: kind === "rerun" ? "Timeout" : "Reverted edit",
        }),
        "owner",
      );
    expect((await h.profiles.read("owner")).preferences).toEqual([]);
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("evidence", {
        kind: "preference",
        guidance: { topic: "pacing", value: "slow for this tutorial" },
      }),
      "owner",
    );
    const input = {
      id: "tutorial-pacing",
      topic: "pacing",
      value: "slow",
      scope: { medium: "video", useCase: "tutorial" },
      evidence: [{ copyId: h.copyId, eventId: "evidence" }],
    };
    await h.profiles.propose(h.copyId, "agent", 0, input);
    expect(await h.profiles.propose(h.copyId, "agent", 0, input)).toMatchObject(
      { id: input.id },
    );
    expect((await h.profiles.read("owner")).revision).toBe(1);
    const proposed = await h.profiles.read("owner");
    expect(proposed.preferences[0]).toMatchObject({
      status: "proposed",
      author: "agent",
    });
    expect(
      memoryContext(
        h.projects.exportMemory(h.copyId, "owner"),
        proposed.preferences,
        input.scope,
      ).taste,
    ).toEqual([]);
    await h.profiles.manage("owner", 1, input.id, "activate");
    let p = await h.profiles.read("owner");
    expect(
      memoryContext(emptyMemory(), p.preferences, input.scope).taste,
    ).toHaveLength(1);
    expect(
      memoryContext(emptyMemory(), p.preferences, {
        medium: "image",
        useCase: "creature",
      }).taste,
    ).toHaveLength(0);
    await h.profiles.manage("owner", 2, input.id, "activate", {
      ...input,
      value: "gentle pacing",
    });
    await h.profiles.manage("owner", 3, input.id, "disable");
    p = await h.profiles.read("owner");
    expect(p.preferences[0].status).toBe("disabled");
    await h.profiles.manage("owner", 4, input.id, "delete");
    expect((await h.profiles.read("owner")).preferences).toEqual([]);
    expect((await h.profiles.read("stranger")).preferences).toEqual([]);
  });
  it("resolves current request, project, scoped taste, defaults; surfaces equal-rank conflicts", () => {
    const pref = (
      id: string,
      value: string,
      scope = { medium: "video", useCase: "tutorial" },
    ): TastePreference => ({
      id,
      topic: "pacing",
      value,
      scope,
      evidence: [{ copyId: "p", eventId: "e" }],
      author: "owner",
      status: "active",
    });
    const taste = [pref("a", "slow"), pref("b", "fast")];
    expect(resolveGuidance([], [], taste)[0]).toMatchObject({
      source: "taste",
      conflict: true,
    });
    const project = [{ id: "project", topic: "pacing", value: "steady" }];
    expect(resolveGuidance([], project, taste)[0]).toMatchObject({
      source: "project",
      conflict: false,
    });
    expect(
      resolveGuidance(
        [{ id: "now", topic: "pacing", value: "fast" }],
        project,
        taste,
      )[0],
    ).toMatchObject({
      source: "request",
      choices: [{ id: "now", topic: "pacing", value: "fast" }],
    });
    expect(
      resolveGuidance(
        [],
        [],
        [
          pref("wide", "slow", { medium: "*", useCase: "*" }),
          pref("specific", "fast"),
        ],
      )[0].choices.map((c) => c.id),
    ).toEqual(["specific"]);
  });
  it("persists profiles privately and removes derived taste when evidence is forgotten", async () => {
    const h = await memoryHarness();
    await h.projects.decide(h.copyId, "owner", h.decision("e"), "owner");
    await h.profiles.propose(h.copyId, "owner", 0, {
      id: "p",
      topic: "tone",
      value: "quiet",
      scope: { medium: "video", useCase: "tutorial" },
      evidence: [{ copyId: h.copyId, eventId: "e" }],
    });
    await h.profiles.manage("owner", 1, "p", "activate");
    const profiles = new TasteProfiles(h.directory, h.projects);
    expect((await profiles.read("owner")).preferences[0].status).toBe("active");
    await profiles.forgetEvidence("owner", h.copyId, "e");
    await h.projects.forget(h.copyId, "owner", h.context().memoryRevision, "e");
    expect((await profiles.read("owner")).preferences).toEqual([]);
    expect(h.context().decisions).toEqual([]);
    const mode = (await stat(h.directory + "/taste-profiles")).mode & 0o777;
    expect(mode).toBe(0o700);
  });
  it("does not let an agent interpretation supersede an owner decision", async () => {
    const h = await memoryHarness();
    await h.link("agent");
    await h.projects.decide(
      h.copyId,
      "owner",
      h.decision("owner-pref", {
        kind: "preference",
        guidance: { topic: "pacing", value: "slow" },
      }),
      "owner",
    );
    await h.projects.decide(
      h.copyId,
      "agent",
      h.decision("agent-pref", {
        kind: "preference",
        source: "interpretation",
        supersedes: "owner-pref",
        guidance: { topic: "pacing", value: "fast" },
      }),
      "agent",
    );
    expect(
      projectGuidance(h.projects.exportMemory(h.copyId, "owner").events).map(
        (g) => g.value,
      ),
    ).toEqual(["slow"]);
  });
});

describe("reference and context boundaries", () => {
  it("records an uninspected source and unknown rights; refuses missing assets and executable URLs", async () => {
    const h = await memoryHarness();
    const ref = {
      id: "ref",
      baseRevision: 1,
      memoryRevision: h.context().memoryRevision,
      url: "https://github.com/example/scene",
      purpose: "motion",
      observation: "Review the orbit timing",
    };
    expect(await h.projects.reference(h.copyId, "owner", ref)).toMatchObject({
      inspected: false,
    });
    expect(await h.projects.reference(h.copyId, "owner", ref)).toMatchObject({
      id: "ref",
    });
    expect(h.context().references[0].licence).toBeUndefined();
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:pass@example.com",
    ])
      await expect(
        h.projects.reference(h.copyId, "owner", { ...ref, id: "bad", url }),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      h.projects.reference(h.copyId, "owner", {
        ...ref,
        url: undefined,
        assetId: "missing",
        id: "missing-ref",
        memoryRevision: h.context().memoryRevision,
      }),
    ).rejects.toThrow(/not found/);
  });
  it("bounds multibyte context, preserves pagination, and flags excessive guidance", async () => {
    const h = await memoryHarness();
    for (let i = 0; i < 45; i++)
      await h.projects.decide(
        h.copyId,
        "owner",
        h.decision(`e-${i}`, { reason: "耳".repeat(500) }),
        "owner",
      );
    const memory = h.projects.exportMemory(h.copyId, "owner");
    const context = memoryContext(memory, [], {
      medium: "video",
      useCase: "tutorial",
    });
    expect(jsonBytes(context)).toBeLessThan(50 * 1024);
    expect(context.hasMore).toBe(true);
    const second = memoryContext(
      memory,
      [],
      { medium: "video", useCase: "tutorial" },
      context.nextCursor,
    );
    expect(second.events[0].cursor).toBe(context.nextCursor + 1);
  });
});
