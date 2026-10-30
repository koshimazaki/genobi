import type { AgentSession, AgentSessionStatus } from "../shared/agent-session";
import type { MemoryProjects } from "./memory-projects";
import type { TasteProfiles } from "./taste-profiles";
import type { Running } from "./agent-session-types";
import { tasteShelfContext } from "../shared/licensing/taste-shelf";

export interface AgentMemoryOptions {
  projects: MemoryProjects;
  profiles: TasteProfiles;
}
/** Runner lifecycle writes are queued per session; finalization drains progress first. */
export class AgentMemory {
  private queues = new Map<string, Promise<unknown>>();
  constructor(private options?: AgentMemoryOptions) {}
  async begin(session: Running, copyId?: string) {
    if (!this.options) return undefined;
    const { projects, profiles } = this.options;
    if (!copyId) {
      const profile = await profiles.read(session.owner);
      return { tasteShelf: tasteShelfContext(profile.shelf) };
    }
    const access = projects.access(copyId, session.owner);
    session.copyId = access.copyId;
    await projects.beginSession(access.copyId, session.owner, {
      id: session.view.id,
      runner: session.view.runner,
      goal: session.view.prompt,
    });
    const profile = await profiles.read(access.owner);
    return projects.context(
      access.copyId,
      session.owner,
      profile.preferences,
      {
        medium: "video",
        useCase: "general",
      },
      0,
      profile.shelf,
    );
  }
  private pending = new Map<
    string,
    { session: Running; view: AgentSession; terminal: boolean }
  >();
  progress(session: Running, terminal = false): Promise<unknown> {
    if (!session.copyId || !this.options) return Promise.resolve();
    const id = session.view.id;
    this.pending.set(id, {
      session,
      view: structuredClone(session.view),
      terminal,
    });
    const existing = this.queues.get(id);
    if (existing) return existing;
    // One flush in flight; intermediate stream updates coalesce to the newest.
    const flush = Promise.resolve()
      .then(async () => {
        while (this.pending.has(id)) {
          const {
            session: current,
            view,
            terminal: ending,
          } = this.pending.get(id)!;
          this.pending.delete(id);
          await this.options!.projects.progress(
            current.copyId!,
            current.owner,
            id,
            view.lines.at(-1) ?? "",
            ending
              ? view.status === "starting" || view.status === "running"
                ? "interrupted"
                : view.status
              : undefined,
            ending ? view.summary : undefined,
          );
        }
      })
      .finally(() => this.queues.delete(id));
    this.queues.set(id, flush);
    return flush;
  }
  async finish(session: Running) {
    try {
      await this.progress(session, true);
    } finally {
      this.queues.delete(session.view.id);
    }
  }
  async drain() {
    await Promise.all(this.queues.values());
  }
  read(id: string, owner: string): AgentSession | undefined {
    const saved = this.options?.projects.savedSession(id, owner);
    if (!saved || (saved.runner !== "hermes" && saved.runner !== "claude"))
      return undefined;
    const runner = saved.runner;
    return {
      id,
      runner,
      prompt: saved.goal,
      startedAt: saved.startedAt,
      status: saved.status as AgentSessionStatus,
      ...(saved.summary ? { summary: saved.summary } : {}),
      lines: saved.progress ? [saved.progress] : [],
    };
  }
}
