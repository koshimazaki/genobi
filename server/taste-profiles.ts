import type { PreferenceInput } from "../shared/memory/schema";
import { tasteShelfSchema } from "../shared/licensing/taste-shelf";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emptyProfile,
  preferenceSchema,
  type TasteProfile,
} from "../shared/memory/schema";
import { canonical } from "../shared/memory/state";
import { memoryError, parseMemory } from "./memory-projects";
import type { MemoryProjects } from "./memory-projects";

function checkSupersession(profile: TasteProfile, input: PreferenceInput) {
  const entries = new Map(profile.preferences.map((p) => [p.id, p]));
  const seen = new Set([input.id]);
  let parent = input.supersedes;
  while (parent) {
    const held = entries.get(parent);
    if (seen.has(parent) || !held || held.topic !== input.topic)
      throw memoryError(
        "Preference supersession must be acyclic and refer to the same topic.",
      );
    seen.add(parent);
    parent = held.supersedes;
  }
}

/** Owner-scoped, private, revision-checked JSON. No profile enters a project ZIP. */
export class TasteProfiles {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private directory: string,
    private projects: MemoryProjects,
  ) {}
  private file(owner: string) {
    return path.join(
      this.directory,
      "taste-profiles",
      `${createHash("sha256").update(owner).digest("hex")}.json`,
    );
  }
  async read(owner: string): Promise<TasteProfile> {
    try {
      return JSON.parse(await readFile(this.file(owner), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyProfile();
      throw error;
    }
  }
  private write<T>(
    owner: string,
    expected: number,
    change: (profile: TasteProfile) => T,
    replay?: (profile: TasteProfile) => T | undefined,
  ) {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const profile = await this.read(owner);
        const held = replay?.(profile);
        if (held !== undefined) return held;
        if (profile.revision !== expected)
          throw memoryError("Taste profile changed. Read it again.", 409);
        const result = change(profile);
        profile.revision++;
        const file = this.file(owner);
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(`${file}.tmp`, JSON.stringify(profile), {
          mode: 0o600,
        });
        await rename(`${file}.tmp`, file);
        return result;
      });
    this.queue = task;
    return task;
  }
  setShelf(owner: string, expected: number, value: unknown) {
    const shelf = parseMemory(tasteShelfSchema, value);
    return this.write(owner, expected, (profile) => {
      profile.shelf = shelf;
      return profile;
    });
  }
  async propose(
    copyId: string,
    session: string,
    expected: number,
    value: unknown,
    actor?: "owner" | "agent",
  ) {
    const input = parseMemory(preferenceSchema, value);
    const access = this.projects.access(copyId, session);
    // Evidence may only cite this linked project, never probe the owner's other projects.
    const memory = this.projects.exportMemory(copyId, session);
    if (
      input.evidence.some(
        (e) =>
          e.copyId !== access.copyId ||
          !memory.events.some(
            (event) => event.id === e.eventId && !event.operational,
          ),
      )
    )
      throw memoryError("Cite decision evidence in the linked project.");
    return this.write(
      access.owner,
      expected,
      (profile) => {
        const held = profile.preferences.find((p) => p.id === input.id);
        if (held) {
          const { author: _author, status: _status, ...stored } = held;
          if (canonical(stored) !== canonical(input))
            throw memoryError("Preference ID reused.", 409);
          return held;
        }
        if (profile.preferences.length >= 100)
          throw memoryError("Keep at most 100 taste preferences.");
        if (
          input.supersedes &&
          !profile.preferences.some((p) => p.id === input.supersedes)
        )
          throw memoryError("Superseded preference not found.");
        checkSupersession(profile, input);
        const next = {
          ...input,
          author:
            actor ?? (access.isOwner ? ("owner" as const) : ("agent" as const)),
          status: "proposed" as const,
        };
        profile.preferences.push(next);
        return next;
      },
      (profile) => {
        const held = profile.preferences.find((p) => p.id === input.id);
        if (!held) return undefined;
        const { author: _author, status: _status, ...stored } = held;
        if (canonical(stored) !== canonical(input))
          throw memoryError("Preference ID reused.", 409);
        return held;
      },
    );
  }
  manage(
    owner: string,
    expected: number,
    id: string,
    action: "activate" | "disable" | "delete",
    edit?: unknown,
  ) {
    return this.write(owner, expected, (profile) => {
      const held = profile.preferences.find((p) => p.id === id);
      if (!held) throw memoryError("Preference not found.", 404);
      if (action === "delete") {
        profile.preferences = profile.preferences.filter((p) => p.id !== id);
        return { deleted: true };
      }
      if (edit !== undefined) {
        const next = parseMemory(preferenceSchema, edit);
        if (next.id !== id) throw memoryError("Preference ID cannot change.");
        // Editing is an owner action; validate every cited project and event.
        for (const e of next.evidence) {
          if (
            !this.projects.access(e.copyId, owner).isOwner ||
            !this.projects
              .exportMemory(e.copyId, owner)
              .events.some((event) => event.id === e.eventId)
          )
            throw memoryError("Evidence not found.");
        }
        if (
          next.supersedes === id ||
          (next.supersedes &&
            !profile.preferences.some((p) => p.id === next.supersedes))
        )
          throw memoryError("Invalid superseded preference.");
        checkSupersession(profile, next);
        // Replace the fields so an omitted `supersedes` is cleared.
        delete held.supersedes;
        Object.assign(held, next, { author: "owner" });
      }
      if (action === "activate") {
        for (const e of held.evidence)
          if (
            !this.projects
              .exportMemory(e.copyId, owner)
              .events.some((event) => event.id === e.eventId)
          )
            throw memoryError("Supporting evidence was deleted.");
      }
      held.status = action === "activate" ? "active" : "disabled";
      return held;
    });
  }
  /** Removing evidence also removes its derived preferences, including proposals. */
  forgetEvidence(owner: string, copyId: string, eventId?: string) {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const p = await this.read(owner);
        p.preferences = p.preferences.filter(
          (item) =>
            !item.evidence.some(
              (e) => e.copyId === copyId && (!eventId || e.eventId === eventId),
            ),
        );
        p.revision++;
        const file = this.file(owner);
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(`${file}.tmp`, JSON.stringify(p), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
    this.queue = task;
    return task;
  }
}
