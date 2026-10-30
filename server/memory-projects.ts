import { createHash, randomUUID } from "node:crypto";
import {
  decisionSchema,
  checkpointSchema,
  referenceSchema,
  emptyMemory,
  type MemorySession,
  type ProjectMemory,
} from "../shared/memory/schema";
import { appendEvent, canonical, MAX_EVENTS } from "../shared/memory/state";
import { memoryContext } from "../shared/memory/context";
import type { TasteScope, TastePreference } from "../shared/memory/schema";
import type { TasteShelf } from "../shared/licensing/taste-shelf";
import { projectFeedback } from "../shared/director/feedback";
import { AgentProjectCopies } from "./project-takes";
import type { CopyRecord } from "./project-record";
import { AppError } from "./errors";

export const memoryError = (message: string, status = 400) =>
  new AppError(
    status,
    message,
    status === 409 ? "memory_conflict" : "invalid_memory",
  );
/** Drop the oldest operational events so routine saves never fill the history. */
function makeRoom(memory: ProjectMemory) {
  while (memory.events.length >= MAX_EVENTS) {
    const index = memory.events.findIndex((e) => e.operational);
    if (index < 0) return;
    const [dropped] = memory.events.splice(index, 1);
    for (const e of memory.events) {
      if (e.supersedes === dropped.id) delete e.supersedes;
      if (e.priorAttempt === dropped.id) delete e.priorAttempt;
    }
  }
}
export const parseMemory = <T>(
  schema: { parse: (value: unknown) => T },
  value: unknown,
): T => {
  try {
    return schema.parse(value);
  } catch {
    throw memoryError("Invalid memory record. Check its fields and limits.");
  }
};
const checkRevision = (r: CopyRecord, base: number, memory: number) => {
  if (r.revision !== base || (r.memory?.revision ?? 0) !== memory)
    throw memoryError(
      "Project or memory changed. Read context again before writing.",
      409,
    );
};
const principalOf = (session: string) =>
  createHash("sha256").update(session).digest("hex");
const PRINCIPAL_DIGEST = /^[a-f0-9]{64}$/;

/** Memory is outside the exported project manifest, in the same atomic copy record. */
export class MemoryProjects extends AgentProjectCopies {
  override async load() {
    await super.load();
    for (const record of this.records) {
      if (
        !record.memory?.sessions.some(
          (s) => s.status === "running" || !PRINCIPAL_DIGEST.test(s.principal),
        )
      )
        continue;
      const next = structuredClone(record);
      for (const session of next.memory!.sessions) {
        if (!PRINCIPAL_DIGEST.test(session.principal))
          session.principal = principalOf(session.principal);
        if (session.status === "running") {
          session.status = "interrupted";
          session.summary = undefined;
          session.progress =
            "Server stopped before the session finished. Last checkpoint retained.";
        }
      }
      next.memory!.revision++;
      await super.save(next);
    }
  }

  /** All successful project mutations get an operational event, never inferred taste. */
  protected override async save(record: CopyRecord, actor?: "owner" | "agent") {
    const previous = this.records.find((r) => r.copyId === record.copyId);
    const next = structuredClone(record);
    if (!previous || previous.revision !== next.revision) {
      const memory = (next.memory ??= emptyMemory());
      makeRoom(memory);
      if (memory.events.length >= MAX_EVENTS)
        throw memoryError(
          "Export and clear private project history before saving more revisions (4,000 events maximum).",
          409,
        );
      const agent = actor === "agent";
      const event = appendEvent(
        memory,
        {
          id: randomUUID(),
          baseRevision: next.revision,
          memoryRevision: memory.revision,
          kind: "note",
          objectIds: [],
          source: "ui-action",
          reason: agent
            ? "Agent project revision saved."
            : "Studio project revision saved; may include Undo. No taste inferred.",
        },
        { projectId: next.copyId, actor: actor ?? "system" },
        new Date().toISOString(),
      );
      event.operational = true;
      // A crash after the edit still leaves a revision checkpoint.
      const session = [...memory.sessions]
        .reverse()
        .find((s) => s.status === "running");
      if (agent && session) {
        event.sessionId = session.id;
        session.progress = `Saved project revision ${next.revision}.`;
      }
    }
    await super.save(next);
  }

  access(id: string, session: string) {
    const r = this.readable(id, session);
    return {
      owner: r.sessionId,
      copyId: r.copyId,
      isOwner: r.sessionId === session,
      revision: r.revision,
    };
  }
  context(
    id: string,
    session: string,
    preferences: TastePreference[],
    scope: TasteScope,
    after = 0,
    shelf?: TasteShelf,
  ) {
    const r = this.readable(id, session);
    const feedback = projectFeedback({
      project: r.project,
      prompt: r.brief?.text ?? "",
    });
    return {
      copyId: r.copyId,
      revision: r.revision,
      constraints: (r.brief?.text ?? "").slice(0, 4000),
      feedback: {
        baseRevision: feedback.baseRevision,
        commands: feedback.commands
          .slice(0, 16)
          .map((c) => ({ label: c.label.slice(0, 300) })),
        notes: feedback.notes.slice(0, 12).map((n) => ({
          id: n.id,
          frame: n.frame,
          text: n.text.slice(0, 300),
        })),
        unmapped: feedback.unmapped
          .slice(0, 8)
          .map((u) => ({ reason: u.reason.slice(0, 300) })),
      },
      ...memoryContext(
        r.memory ?? emptyMemory(),
        preferences,
        scope,
        after,
        [],
        shelf,
      ),
    };
  }
  exportMemory(id: string, session: string) {
    const r = this.readable(id, session);
    return structuredClone(r.memory ?? emptyMemory());
  }
  private update<T>(
    id: string,
    session: string,
    action: (r: CopyRecord, m: ProjectMemory) => T | Promise<T>,
  ) {
    return this.run(async () => {
      const r = structuredClone(this.readable(id, session));
      const m = (r.memory ??= emptyMemory());
      const result = await action(r, m);
      await super.save(r);
      return result;
    });
  }
  async decide(
    id: string,
    session: string,
    value: unknown,
    actor: "owner" | "agent",
    sessionId?: string,
  ) {
    const input = parseMemory(decisionSchema, value);
    return this.update(id, session, (r, m) => {
      const held = m.events.find((e) => e.id === input.id);
      if (held) {
        if (
          held.receipt !== canonical(input) ||
          held.actor !== actor ||
          held.sessionId !== sessionId
        )
          throw memoryError("Event ID was reused for different evidence.", 409);
        return { event: held, memoryRevision: m.revision };
      }
      checkRevision(r, input.baseRevision, input.memoryRevision);
      if (actor === "agent" && input.source !== "interpretation")
        throw memoryError(
          "An agent may record interpretations, never impersonate an explicit user decision.",
          403,
        );
      if (["rerun", "undo"].includes(input.kind) && input.guidance)
        throw memoryError("Operational events cannot declare taste guidance.");
      if (input.kind === "preference" && !input.guidance)
        throw memoryError("A preference needs a topic and value.");
      if (input.supersedes && !m.events.some((e) => e.id === input.supersedes))
        throw memoryError("Superseded evidence was not found.");
      if (
        input.priorAttempt &&
        !m.events.some((e) => e.id === input.priorAttempt)
      )
        throw memoryError("Prior attempt was not found.");
      if (sessionId && !m.sessions.some((s) => s.id === sessionId))
        throw memoryError("Session does not belong to this project.");
      makeRoom(m);
      if (m.events.length >= MAX_EVENTS)
        throw memoryError(
          "Export and clear private project history before adding more decisions (4,000 maximum).",
          409,
        );
      const event = appendEvent(
        m,
        input,
        { projectId: r.copyId, actor, ...(sessionId ? { sessionId } : {}) },
        new Date().toISOString(),
      );
      return { event, memoryRevision: m.revision };
    });
  }
  async checkpoint(
    id: string,
    session: string,
    value: unknown,
    boundSession?: string,
    principal?: string,
  ) {
    const input = parseMemory(checkpointSchema, value);
    return this.update(id, session, (r, m) => {
      if (boundSession && input.sessionId !== boundSession)
        throw memoryError("Checkpoint belongs to another session.", 403);
      const target = m.sessions.find((s) => s.id === input.sessionId);
      if (
        target &&
        target.principal !==
          principalOf(boundSession ? (principal ?? "") : session)
      )
        throw memoryError("Checkpoint belongs to another client.", 403);
      if (!target)
        throw memoryError("Start a memory session for this project first.");
      if (target.checkpoint?.id === input.id) {
        if (target.checkpoint.receipt !== canonical(input))
          throw memoryError("Checkpoint ID reused.", 409);
        return target.checkpoint;
      }
      checkRevision(r, input.baseRevision, input.memoryRevision);
      if (target.status !== "running" || (boundSession && input.status))
        throw memoryError(
          "Only an active external session can set terminal checkpoint status.",
          409,
        );
      if (
        input.coveredCursor > m.cursor ||
        input.coveredCursor < (target.checkpoint?.coveredCursor ?? 0)
      )
        throw memoryError(
          "Checkpoint coverage is stale or ahead of evidence.",
          409,
        );
      if (
        input.eventIds.some(
          (event) =>
            !m.events.some(
              (e) => e.id === event && e.cursor <= input.coveredCursor,
            ),
        )
      )
        throw memoryError("Checkpoint cites unavailable evidence.");
      const { baseRevision, memoryRevision: _expected, ...body } = input;
      target.checkpoint = {
        ...body,
        revision: baseRevision,
        at: new Date().toISOString(),
        receipt: canonical(input),
      };
      if (input.status) {
        target.status = input.status;
        target.summary = input.summary;
      }
      m.revision++;
      return target.checkpoint;
    });
  }
  beginSession(
    id: string,
    owner: string,
    session: Pick<MemorySession, "id" | "runner" | "goal">,
  ) {
    return this.update(id, owner, (_r, m) => {
      const old = m.sessions.find((s) => s.id === session.id);
      if (old) {
        if (
          old.principal !== principalOf(owner) ||
          old.goal !== session.goal ||
          old.runner !== session.runner
        )
          throw memoryError("Session ID reused.", 409);
        return old;
      }
      const active = m.sessions.filter((s) => s.status === "running");
      if (active.length >= 4)
        throw memoryError("Close an existing memory session first.", 409);
      m.sessions = [
        ...m.sessions.filter((s) => s.status !== "running").slice(-19),
        ...active,
      ];
      const next: MemorySession = {
        ...session,
        principal: principalOf(owner),
        status: "running",
        startedAt: new Date().toISOString(),
      };
      m.sessions.push(next);
      m.revision++;
      return next;
    });
  }
  progress(
    id: string,
    owner: string,
    sessionId: string,
    progress: string,
    status?: MemorySession["status"],
    summary?: string,
  ) {
    return this.update(id, owner, (_r, m) => {
      const s = m.sessions.find((s) => s.id === sessionId);
      if (!s) return;
      s.progress = progress.slice(0, 500);
      if (status) {
        s.status = status;
        s.summary = summary?.slice(0, 2000);
      }
      // Progress is operational state, not evidence CAS. Otherwise a tool-use
      // line between context and a write would invalidate that write forever.
      if (status) m.revision++;
    });
  }
  savedSession(id: string, owner: string) {
    for (const record of this.records.filter((r) => r.sessionId === owner)) {
      const s = record.memory?.sessions.find((s) => s.id === id);
      if (s) return { ...s, copyId: record.copyId };
    }
    return undefined;
  }
  async reference(id: string, session: string, value: unknown) {
    const input = parseMemory(referenceSchema, value);
    return this.update(id, session, (r, m) => {
      const held = m.references.find((ref) => ref.id === input.id);
      if (held) {
        if (held.receipt !== canonical(input))
          throw memoryError("Reference ID reused.", 409);
        return held;
      }
      checkRevision(r, input.baseRevision, input.memoryRevision);
      if (input.assetId && !Object.hasOwn(r.project.assets, input.assetId))
        throw memoryError("Reference asset was not found in this project.");
      if (m.references.length >= 100)
        throw memoryError("Keep at most 100 project references.");
      const { baseRevision: _base, memoryRevision: _expected, ...body } = input;
      const ref = {
        ...body,
        inspected: false as const,
        receipt: canonical(input),
      };
      m.references.push(ref);
      m.revision++;
      return ref;
    });
  }
  forget(
    id: string,
    owner: string,
    revision: number,
    eventId?: string,
    referenceId?: string,
    beforeForget?: () => Promise<void>,
  ) {
    if (!this.access(id, owner).isOwner)
      throw memoryError("Only the owner may forget memory.", 403);
    return this.update(id, owner, async (_r, m) => {
      if (m.revision !== revision)
        throw memoryError("Memory changed. Read it again.", 409);
      await beforeForget?.();
      m.events = eventId
        ? m.events.filter((e) => e.id !== eventId)
        : referenceId
          ? m.events
          : [];
      m.references = referenceId
        ? m.references.filter((r) => r.id !== referenceId)
        : eventId
          ? m.references
          : [];
      // Summaries may contain the forgotten text: remove derived copies too.
      // Forgetting one event keeps session records so a live runner can continue.
      if (!referenceId && !eventId) m.sessions = [];
      if (eventId)
        for (const s of m.sessions) {
          delete s.summary;
          delete s.progress;
          delete s.checkpoint;
        }
      if (eventId)
        for (const e of m.events) {
          if (e.supersedes === eventId) delete e.supersedes;
          if (e.priorAttempt === eventId) delete e.priorAttempt;
        }
      m.revision++;
      return { memoryRevision: m.revision };
    });
  }
}
