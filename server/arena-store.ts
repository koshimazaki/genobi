import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { arenaDraft, type Arena, type ArenaMedia } from "../shared/arena";
import { parseArenaIndex } from "./arena-index";
import { AppError } from "./errors";

interface Record {
  owner: string;
  arena: Arena;
}
/** Local, session-owned comparisons. Link grants are one-use and expire on restart. */
export class ArenaStore {
  private records: Record[] = [];
  private damaged = false;
  private queue: Promise<unknown> = Promise.resolve();
  private codes = new Map<string, { id: string; expires: number }>();
  private links = new Map<string, Set<string>>();
  readonly directory: string;
  constructor(directory: string) {
    this.directory = path.join(directory, "arena");
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const data = await readFile(
        path.join(this.directory, "index.json"),
        "utf8",
      );
      if (data.length > 8 * 1024 * 1024)
        throw new Error("Arena index too large");
      this.records = parseArenaIndex(JSON.parse(data));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        this.damaged = true;
    }
  }
  private available() {
    if (this.damaged)
      throw new AppError(
        503,
        "Arena storage could not be read. Preserve index.json and repair or restore it before using Arena.",
      );
  }
  list(owner: string) {
    this.available();
    return this.records
      .filter(
        (r) => r.owner === owner || this.links.get(r.arena.id)?.has(owner),
      )
      .map((r) => r.arena);
  }
  get(id: string, owner: string, ownerOnly = false) {
    this.available();
    const r = this.records.find(
      (r) =>
        r.arena.id === id &&
        (r.owner === owner || (!ownerOnly && this.links.get(id)?.has(owner))),
    );
    if (!r)
      throw new AppError(404, "Comparison not found. Open or link it first.");
    return r.arena;
  }
  private change<T>(
    edit: () => Promise<{
      rows: Record[];
      result: T;
      written?: string;
      /** Files the new index no longer lists, removed once it is written. */
      removed?: string[];
    }>,
  ) {
    const pending = this.queue
      .catch(() => {})
      .then(async () => {
        this.available();
        const { rows, result, written, removed = [] } = await edit();
        const file = path.join(this.directory, "index.json");
        try {
          const json = JSON.stringify(rows);
          if (Buffer.byteLength(json) > 8 * 1024 * 1024)
            throw new AppError(
              507,
              "Arena index is full. Delete an unused comparison.",
            );
          await writeFile(file + ".tmp", json, { mode: 0o600 });
          await rename(file + ".tmp", file);
        } catch (error) {
          // A media file the index never listed would hold quota unseen.
          if (written) await rm(written, { force: true }).catch(() => {});
          throw error;
        }
        this.records = rows;
        for (const stale of removed)
          await rm(stale, { force: true }).catch(() => {});
        return result;
      });
    this.queue = pending;
    return pending;
  }
  create(owner: string, input: unknown) {
    const parsed = arenaDraft.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        400,
        "Invalid comparison. Use two to four distinct approaches.",
      );
    if (parsed.data.slots.some((s) => s.media))
      throw new AppError(400, "Upload results after creating the comparison.");
    return this.change(async () => {
      if (
        this.records.length >= 200 ||
        this.records.filter((r) => r.owner === owner).length >= 20
      )
        throw new AppError(
          507,
          "Comparison storage is full. Delete an unused comparison.",
        );
      const arena: Arena = {
        ...parsed.data,
        id: randomUUID(),
        revision: 0,
        updatedAt: new Date().toISOString(),
        media: [],
      };
      return { rows: [...this.records, { owner, arena }], result: arena };
    });
  }
  update(id: string, owner: string, revision: unknown, input: unknown) {
    const parsed = arenaDraft.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        400,
        "Invalid comparison. Check the prompt and approaches.",
      );
    return this.change(async () => {
      const before = this.get(id, owner);
      if (before.revision !== revision)
        throw new AppError(409, "Comparison changed. Reload before saving.");
      if (
        parsed.data.slots.some(
          (s) => s.media && !before.media.some((m) => m.hash === s.media),
        )
      )
        throw new AppError(400, "Choose media uploaded to this comparison.");
      const arena = {
        ...before,
        ...parsed.data,
        preferred: parsed.data.preferred,
        sourceSeconds: parsed.data.sourceSeconds,
        settings: parsed.data.settings,
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      return {
        rows: this.records.map((r) =>
          r.arena.id === id ? { ...r, arena } : r,
        ),
        result: arena,
      };
    });
  }
  upload(
    id: string,
    owner: string,
    bytes: Buffer,
    measured: Omit<ArenaMedia, "hash" | "bytes">,
  ) {
    return this.change(async () => {
      const added = await this.add(this.get(id, owner), bytes, measured);
      return {
        rows: this.replace(added.arena),
        result: { arena: added.arena, media: added.media },
        written: added.written,
      };
    });
  }
  /**
   * Studio media in one write: stored (or found, when the same bytes are
   * already here) and, when a slot is named, set as that approach's result,
   * so a crash cannot leave it half-attached. A run's result only lands in
   * the slot still waiting for that run.
   */
  attach(
    id: string,
    owner: string,
    {
      bytes,
      measured,
      slot,
    }: {
      bytes: Buffer;
      measured: Omit<ArenaMedia, "hash" | "bytes">;
      slot?: { id: string; jobId?: string };
    },
  ) {
    return this.change(async () => {
      const before = this.get(id, owner);
      const target = slot && before.slots.find((s) => s.id === slot.id);
      if (slot && !target)
        throw new AppError(404, "That approach is not in this comparison.");
      if (slot?.jobId && target?.run?.jobId !== slot.jobId)
        throw new AppError(
          409,
          "This approach is no longer waiting for that run.",
        );
      const added = await this.add(before, bytes, measured);
      // A replaced result no other approach shows goes, so it cannot
      // reappear as an unexplained reference on the next image run.
      const superseded =
        target?.media &&
        target.media !== added.media.hash &&
        !before.slots.some(
          (s) => s.id !== target.id && s.media === target.media,
        )
          ? target.media
          : undefined;
      const arena = {
        ...added.arena,
        media: added.arena.media.filter((m) => m.hash !== superseded),
        slots: added.arena.slots.map((s) =>
          s.id === slot?.id
            ? { ...s, media: added.media.hash, status: "ready" as const }
            : s,
        ),
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      return {
        rows: this.replace(arena),
        result: { arena, media: added.media },
        written: added.written,
        removed: superseded ? [path.join(this.directory, id, superseded)] : [],
      };
    });
  }
  /** Sets or clears an agent's request that the person run approaches. */
  requestRun(id: string, owner: string, slots: unknown) {
    return this.change(async () => {
      const before = this.get(id, owner);
      let runRequest: Arena["runRequest"];
      if (slots !== null) {
        const ids = Array.isArray(slots)
          ? slots
          : before.slots.filter((s) => s.run?.entry).map((s) => s.id);
        if (
          !ids.length ||
          ids.length > 4 ||
          ids.some(
            (slot) => !before.slots.some((s) => s.id === slot && s.run?.entry),
          )
        )
          throw new AppError(
            400,
            "Name approaches in this comparison that have a model to run.",
          );
        runRequest = {
          slots: [...new Set(ids as string[])],
          requestedAt: new Date().toISOString(),
        };
      }
      const { runRequest: _old, ...rest } = before;
      const arena: Arena = {
        ...rest,
        ...(runRequest ? { runRequest } : {}),
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      return { rows: this.replace(arena), result: arena };
    });
  }
  private replace(arena: Arena) {
    return this.records.map((r) =>
      r.arena.id === arena.id ? { ...r, arena } : r,
    );
  }
  private async add(
    before: Arena,
    bytes: Buffer,
    measured: Omit<ArenaMedia, "hash" | "bytes">,
  ): Promise<{ arena: Arena; media: ArenaMedia; written?: string }> {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const exists = before.media.find((m) => m.hash === hash);
    if (exists) return { arena: before, media: exists };
    if (
      before.media.length >= 24 ||
      before.media.reduce((n, m) => n + m.bytes, bytes.length) >
        256 * 1024 * 1024
    )
      throw new AppError(413, "This comparison has reached its media limit.");
    const media = { ...measured, hash, bytes: bytes.length };
    const dir = path.join(this.directory, before.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const written = path.join(dir, hash);
    await writeFile(written, bytes, { mode: 0o600 });
    return {
      arena: {
        ...before,
        media: [...before.media, media],
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
      },
      media,
      written,
    };
  }
  async remove(id: string, owner: string) {
    await this.change(async () => {
      this.get(id, owner, true);
      return {
        rows: this.records.filter((r) => r.arena.id !== id),
        result: undefined,
      };
    });
    this.links.delete(id);
    for (const [key, value] of this.codes)
      if (value.id === id) this.codes.delete(key);
    await rm(path.join(this.directory, id), { recursive: true, force: true });
  }
  code(id: string, owner: string) {
    this.get(id, owner, true);
    for (const [key, value] of this.codes)
      if (value.id === id || value.expires < Date.now()) this.codes.delete(key);
    const code = randomBytes(16).toString("hex");
    this.codes.set(code, { id, expires: Date.now() + 600_000 });
    return code;
  }
  link(code: unknown, owner: string) {
    const entry = typeof code === "string" ? this.codes.get(code) : undefined;
    if (!entry || entry.expires < Date.now())
      throw new AppError(404, "Pairing code expired or already used.");
    this.codes.delete(code as string);
    const links = this.links.get(entry.id) ?? new Set<string>();
    links.add(owner);
    this.links.set(entry.id, links);
    return this.get(entry.id, owner);
  }
}
