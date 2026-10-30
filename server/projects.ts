// The project copy on disk: the studio's Director project mirrored under
// `.local/projects/`, one bundle per owner session and project id, with the
// browser as the owner and a revision check on every write. Agents read it
// and send Director commands (`shared/director/commands.ts`) once the owner
// links them; every accepted write is announced to the project's streams.
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  COPY_ID,
  DIRECTOR_ID,
  parseCommand,
  type DirectorCommand,
} from "../shared/director/commands";
import { applyAgentCommand } from "../shared/director/feedback";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_PROJECT_BYTES,
  type Project,
} from "../shared/director/types";
import { validateProject } from "../src/director/validate";
import { AppError } from "./errors";
import { CopyStreams } from "./project-streams";
import { LinkCodes } from "./project-links";
import { Staging } from "./project-staging";
import {
  afterCommand,
  bounded,
  checkBrief,
  directoryBytes,
  exactKeys,
  exists,
  isObject,
  namedBytes,
  randomToken,
  requiredFiles,
  tooLarge,
  writeCopy,
} from "./project-bundle";

export const PROJECTS_PER_SESSION = 16;
/** The bundle limit the studio already holds a project to. */
export const PROJECT_BYTES = DIRECTOR_PROJECT_BYTES;
/** One file: the Director's own media limit, so an imported file always fits. */
export const FILE_BYTES = DIRECTOR_MEDIA_BYTES;
export const AGENTS_PER_PROJECT = 4;
const SHA = /^[a-f0-9]{64}$/;

import type { CopyRecord } from "./project-record";
export type { CopyRecord } from "./project-record";
export interface CopyEvent {
  projectId: string;
  copyId: string;
  revision: number;
  baseRevision: number | null;
  /** `studio`: the owner pushed. `command`: a Director command was applied. */
  source: "snapshot" | "studio" | "command";
  command?: DirectorCommand;
}
const HANDLE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const notFound = () =>
  new AppError(404, "Project not found.", "project_missing");
const conflict = (revision: number | null) =>
  new AppError(
    409,
    "The project copy has changed since that revision. Read it again before writing.",
    "revision_conflict",
    { revision },
  );
const ownerDir = (sessionId: string) =>
  createHash("sha256").update(sessionId).digest("hex").slice(0, 24);

export class ProjectCopies {
  protected records: CopyRecord[] = [];
  private streams = new CopyStreams();
  private links = new LinkCodes();
  private queue: Promise<unknown> = Promise.resolve();
  private staging: Staging;
  /** `projectBytes` and `clock`: tests pass a small limit and their own time. */
  constructor(
    readonly directory: string,
    protected projectBytes = PROJECT_BYTES,
    clock: () => number = Date.now,
  ) {
    this.staging = new Staging(clock);
  }

  private get root() {
    return path.join(this.directory, "projects");
  }
  protected dir(sessionId: string, id: string) {
    return path.join(this.root, ownerDir(sessionId), id);
  }
  private key = (r: { sessionId: string; id: string }) =>
    `${r.sessionId}/${r.id}`;

  async load() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const owner of await readdir(this.root))
      for (const id of await readdir(path.join(this.root, owner)).catch(
        () => [],
      ))
        try {
          const file = path.join(this.root, owner, id, "copy.json");
          const record = JSON.parse(await readFile(file, "utf8"));
          this.records.push(record);
          // Staging from before a restart is no longer tracked: reclaim it.
          await this.prune(record);
          // Copies written before handles existed get one, kept from now on.
          if (!record.copyId) {
            record.copyId = this.newHandle(record.id);
            await this.save(record);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          // Files staged for a copy that was never pushed.
          await rm(path.join(this.root, owner, id), {
            recursive: true,
            force: true,
          });
        }
  }

  /** One write at a time, so a push and a command cannot interleave. */
  protected run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(task);
    this.queue = next;
    return next;
  }

  private owned(id: string, sessionId: string) {
    if (!DIRECTOR_ID.test(id)) throw notFound();
    return this.records.find((r) => r.id === id && r.sessionId === sessionId);
  }
  /**
   * By handle: the copy, if this session owns it or is linked to it. By bare
   * id: only this session's own copy, since another owner may use the id.
   */
  protected readable(id: string, sessionId: string) {
    const record = COPY_ID.test(id)
      ? this.records.find((r) => r.copyId === id)
      : this.owned(id, sessionId);
    if (!record || !allowed(record, sessionId)) throw notFound();
    return record;
  }

  list(sessionId: string) {
    return this.records
      .filter((r) => r.sessionId === sessionId || r.agents.includes(sessionId))
      .map((r) => ({
        copyId: r.copyId,
        id: r.id,
        name: r.project.name,
        revision: r.revision,
        updatedAt: r.updatedAt,
        access: r.sessionId === sessionId ? "owner" : "linked",
      }));
  }

  read(id: string, sessionId: string) {
    const r = this.readable(id, sessionId);
    return {
      copyId: r.copyId,
      id: r.id,
      revision: r.revision,
      updatedAt: r.updatedAt,
      project: r.project,
      brief: r.brief,
    };
  }

  /** The bytes of one file the copy's manifest names. */
  filePath(id: string, sessionId: string, sha256: string) {
    const r = this.readable(id, sessionId);
    if (!SHA.test(sha256) || !requiredFiles(r.project, r.brief).has(sha256))
      throw new AppError(404, "File not found.", "file_missing");
    return path.join(this.dir(r.sessionId, r.id), "files", sha256);
  }

  /** The owner stores one file by its SHA-256 before pushing a manifest. */
  putFile(id: string, sessionId: string, sha256: string, body: Buffer) {
    if (!DIRECTOR_ID.test(id)) throw notFound();
    if (!SHA.test(sha256))
      throw new AppError(400, "Name the file by its SHA-256.", "invalid_file");
    if (createHash("sha256").update(body).digest("hex") !== sha256)
      throw new AppError(
        400,
        "The file does not match its SHA-256.",
        "invalid_file",
      );
    return this.run(async () => {
      const files = path.join(this.dir(sessionId, id), "files");
      const target = path.join(files, sha256);
      if (await exists(target)) return { stored: false };
      const record = this.owned(id, sessionId);
      if (!record) await this.checkProjectCount(sessionId, id);
      // Files for the next manifest are staged beside the current copy's,
      // which are left out here: replacing a 90 MB clip with a 20 MB one
      // stages 20 MB. The manifest push holds the whole copy to the limit.
      const current = record
        ? requiredFiles(record.project, record.brief)
        : new Set<string>();
      await this.staging.expire(files, current);
      if (
        (await directoryBytes(files, current)) + body.length >
        this.projectBytes
      )
        throw tooLarge();
      await mkdir(files, { recursive: true, mode: 0o700 });
      await writeFile(`${target}.tmp`, body, { mode: 0o600 });
      await rename(`${target}.tmp`, target);
      this.staging.add(files, sha256);
      return { stored: true };
    });
  }

  private async checkProjectCount(sessionId: string, id: string) {
    const owner = path.join(this.root, ownerDir(sessionId));
    // A first upload whose manifest never came stops counting once idle.
    const ids = await this.staging.sweep(
      owner,
      (other) => other === id || !!this.owned(other, sessionId),
    );
    if (!ids.includes(id) && ids.length >= PROJECTS_PER_SESSION)
      throw new AppError(
        409,
        `Keep at most ${PROJECTS_PER_SESSION} project copies.`,
        "project_limit",
      );
  }

  /**
   * The owner's push: the whole manifest and prompt at a new revision, on top
   * of the revision it last saw. A stale base is a conflict, never a merge.
   */
  put(id: string, sessionId: string, body: unknown) {
    if (!DIRECTOR_ID.test(id)) throw notFound();
    if (
      !isObject(body) ||
      !exactKeys(body, ["baseRevision", "project", "brief"])
    )
      throw new AppError(
        400,
        "Send baseRevision, project and brief.",
        "invalid_project",
      );
    const base = body.baseRevision;
    if (base !== null && !(Number.isSafeInteger(base) && (base as number) >= 1))
      throw new AppError(
        400,
        "baseRevision must be a revision or null.",
        "invalid_project",
      );
    let project: Project;
    try {
      project = structuredClone(validateProject(body.project));
    } catch (error) {
      throw new AppError(400, bounded(error), "invalid_project");
    }
    if (project.id !== id)
      throw new AppError(
        400,
        "The project id does not match the address.",
        "invalid_project",
      );
    const brief = checkBrief(project, body.brief ?? null);
    return this.run(async () => {
      const record = this.owned(id, sessionId);
      if (
        record &&
        (base !== record.revision || project.revision <= record.revision)
      ) {
        // This version never lands: free what was staged for it.
        await this.prune(record);
        throw conflict(record.revision);
      }
      if (!record) await this.checkProjectCount(sessionId, id);
      const files = path.join(this.dir(sessionId, id), "files");
      const missing: string[] = [];
      for (const sha of requiredFiles(project, brief))
        if (!(await exists(path.join(files, sha)))) missing.push(sha);
      if (missing.length)
        throw new AppError(
          409,
          "Upload the project's files before its manifest.",
          "files_missing",
          { missing },
        );
      const named = requiredFiles(project, brief);
      if ((await namedBytes(files, named)) > this.projectBytes) {
        // Refused like a conflict: what was staged for it stops counting.
        await this.staging.reclaim(
          files,
          record ? requiredFiles(record.project, record.brief) : new Set(),
        );
        throw tooLarge();
      }
      const next: CopyRecord = {
        id,
        copyId: record?.copyId ?? this.newHandle(id),
        sessionId,
        agents: record?.agents ?? [],
        ...(record?.memory ? { memory: record.memory } : {}),
        revision: project.revision,
        project,
        brief,
        updatedAt: new Date().toISOString(),
      };
      await this.save(next, "owner");
      await this.prune(next);
      this.emit(next, {
        baseRevision: record?.revision ?? null,
        source: "studio",
      });
      return { revision: next.revision };
    });
  }

  /** An agent's command at the revision it read; kept as the agent's revision. */
  command(id: string, sessionId: string, body: unknown) {
    if (!isObject(body) || !exactKeys(body, ["baseRevision", "command"]))
      throw new AppError(
        400,
        "Send baseRevision and command.",
        "invalid_command",
      );
    const base = body.baseRevision;
    if (!Number.isSafeInteger(base) || (base as number) < 1)
      throw new AppError(
        400,
        "baseRevision must be the revision you read.",
        "invalid_command",
      );
    let command: DirectorCommand;
    try {
      command = parseCommand(body.command);
    } catch (error) {
      throw new AppError(400, bounded(error), "invalid_command");
    }
    return this.run(async () => {
      const record = this.readable(id, sessionId);
      if (base !== record.revision) throw conflict(record.revision);
      const result = applyAgentCommand(
        { project: record.project, prompt: record.brief?.text ?? "" },
        command,
      );
      if (!result.ok)
        throw new AppError(422, bounded(result.error), "command_refused");
      try {
        validateProject(result.copy.project);
      } catch (error) {
        throw new AppError(422, bounded(error), "command_refused");
      }
      const brief = await afterCommand(
        this.dir(record.sessionId, record.id),
        result.copy,
        record.brief,
        this.projectBytes,
      );
      const next: CopyRecord = {
        ...record,
        revision: result.copy.project.revision,
        project: result.copy.project,
        brief,
        updatedAt: new Date().toISOString(),
      };
      await this.save(next, "agent");
      this.emit(next, {
        baseRevision: record.revision,
        source: "command",
        command,
      });
      return { revision: next.revision, command };
    });
  }

  /** A one-use code the owner gives an agent to reach this project. */
  link(id: string, sessionId: string) {
    const record = this.owned(id, sessionId);
    if (!record) throw notFound();
    return this.links.create(this.key(record));
  }

  /** Spend a link code: this session may now read and command the project. */
  redeem(sessionId: string, body: unknown) {
    const key = this.links.spend(body);
    return this.run(async () => {
      const record = this.records.find((r) => this.key(r) === key);
      if (!record) throw notFound();
      if (record.sessionId !== sessionId) {
        const agents = [
          ...record.agents.filter((s) => s !== sessionId),
          sessionId,
        ].slice(-AGENTS_PER_PROJECT);
        await this.save({ ...record, agents });
      }
      return {
        copyId: record.copyId,
        id: record.id,
        name: record.project.name,
        revision: record.revision,
      };
    });
  }

  /** Listen for revisions; the current one is the snapshot to start from. */
  subscribe(
    id: string,
    sessionId: string,
    listener: (event: CopyEvent) => void,
    close: () => void,
  ) {
    const record = this.readable(id, sessionId);
    const unsubscribe = this.streams.open(
      this.key(record),
      sessionId,
      listener,
      close,
    );
    return {
      revision: record.revision,
      projectId: record.id,
      copyId: record.copyId,
      unsubscribe,
    };
  }

  /** End every open stream, so the server can close. */
  close() {
    this.streams.closeAll();
  }

  protected emit(
    record: CopyRecord,
    event: Omit<CopyEvent, "projectId" | "copyId" | "revision">,
  ) {
    this.streams.send(
      this.key(record),
      {
        projectId: record.id,
        copyId: record.copyId,
        revision: record.revision,
        ...event,
      },
      (session) => allowed(record, session),
    );
  }

  private newHandle(id: string) {
    let handle: string;
    do handle = `${id}.${randomToken(HANDLE_ALPHABET, 10)}`;
    while (this.records.some((r) => r.copyId === handle));
    return handle;
  }

  protected async save(record: CopyRecord, _actor?: "owner" | "agent") {
    await writeCopy(this.dir(record.sessionId, record.id), record);
    const i = this.records.findIndex((r) => this.key(r) === this.key(record));
    if (i < 0) this.records.push(record);
    else this.records[i] = record;
    // A linked session that lost its place stops hearing about the copy.
    this.streams.revalidate(this.key(record), (session) =>
      allowed(record, session),
    );
  }

  /** Keep only the files the copy names; staging for it is over. */
  private prune(record: CopyRecord) {
    return this.staging.reclaim(
      path.join(this.dir(record.sessionId, record.id), "files"),
      requiredFiles(record.project, record.brief),
    );
  }
}

const allowed = (record: CopyRecord, sessionId: string) =>
  record.sessionId === sessionId || record.agents.includes(sessionId);
