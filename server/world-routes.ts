/**
 * Explicit, ephemeral pairing between one open World tab and local agents:
 * a terminal agent links with the tab's one-use code; a session the person
 * started from the studio is granted by the tab's own browser (`/grant`),
 * for that run only, so a spoken "move the camera" needs no code.
 */
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  WORLD_FILES,
  worldCommand,
  type WorldCommand,
  type WorldFile,
} from "../shared/world-control";
import { AGENT_SESSION_ID } from "../shared/agent-session-events";
import type { AgentScope } from "./agent-session-types";
import { AppError } from "./errors";
import { sameCode } from "./pairing-code";
import type { ProjectCopies } from "./projects";
import { readWorldMedia, type OwnedWorldMedia } from "./world-media";
interface Command {
  id: string;
  caller: string;
  command: WorldCommand;
  state: "queued" | "running" | "done" | "error";
  result?: unknown;
  media?: OwnedWorldMedia;
}
interface Session {
  id: string;
  owner: string;
  code?: string;
  seen: number;
  links: Set<string>;
  /** Agent runs (by session id) the tab's owner granted, to grant order. */
  runs: Map<string, number>;
  commands: Map<string, Command>;
  mediaReads: number;
  files: Map<string, { bytes: Buffer; type: string }>;
}
/** A fixed take holds colour and depth passes, so the session allows two clips. */
const SESSION_BYTES = 144 * 1024 * 1024;
const isFile = (file: string): file is WorldFile =>
  Object.hasOwn(WORLD_FILES, file);
const filePath = (id: string, file: string) => `/api/world/${id}/files/${file}`;
/** A live tab polls every 250 ms; one silent this long has gone. */
const STALE_MS = 15_000;
export interface WorldRouterOptions {
  projects?: ProjectCopies;
  /** True while `run` is `owner`'s own running agent session. */
  ownsRun?: (run: string, owner: string) => boolean;
}
export function worldRouter({
  ownsRun = () => false,
  projects,
}: WorldRouterOptions = {}) {
  const router = express.Router(),
    sessions = new Map<string, Session>();
  /** Grant order: a counter, so two grants in one millisecond still order. */
  let grants = 0;
  const json = express.json({ limit: "128kb" });
  const owner = (res: express.Response) => res.locals.sessionId as string;
  /**
   * Whether the request speaks for a run this tab granted, read from its
   * server-set scope (`scopeAgentRequest`: the run's grant header or its
   * ticketed browser), never from the request body. It ends with the run.
   */
  const granted = (s: Session, res: express.Response) => {
    const scope = res.locals.agent
      ? (res.locals.agentScope as AgentScope | undefined)
      : undefined;
    return !!scope && scope.owner === s.owner && s.runs.has(scope.agentSession);
  };
  function sweep() {
    for (const [id, s] of sessions)
      if (Date.now() - s.seen > 300_000) sessions.delete(id);
  }
  function session(
    req: express.Request,
    res: express.Response,
    browser = false,
  ) {
    sweep();
    const s = sessions.get(String(req.params.id));
    if (
      !s ||
      (browser
        ? s.owner !== owner(res) || res.locals.agent
        : s.owner !== owner(res) &&
          !s.links.has(owner(res)) &&
          !granted(s, res))
    )
      throw new AppError(
        404,
        "World session not found. Pair with the open tab first.",
      );
    return s;
  }
  // Connect agents replaces the owner's other World sessions (one tab per
  // owner, as before). The tab's automatic link for a grant sends `keep`, so
  // a second World view or a remount never ends another tab's session.
  router.post("/connect", json, (req, res) => {
    sweep();
    if (res.locals.agent)
      throw new AppError(403, "Connect agents from the World tab.");
    // `keep` still reclaims the owner's tabs that stopped polling (a reload
    // or a closed window), so reloads never fill the four slots.
    const keep = req.body?.keep === true;
    for (const [id, s] of sessions)
      if (s.owner === owner(res) && (!keep || Date.now() - s.seen > STALE_MS))
        sessions.delete(id);
    if (sessions.size >= 4)
      throw new AppError(429, "Four World tabs are already connected.");
    const s: Session = {
      id: randomUUID(),
      owner: owner(res),
      code: randomBytes(16).toString("hex"),
      seen: Date.now(),
      links: new Set(),
      runs: new Map(),
      commands: new Map(),
      mediaReads: 0,
      files: new Map(),
    };
    sessions.set(s.id, s);
    res.json({ id: s.id, code: s.code });
  });
  router.post("/link", json, (req, res) => {
    sweep();
    const code = req.body?.code;
    if (typeof code !== "string" || !/^[a-f0-9]{32}$/.test(code))
      throw new AppError(400, "Enter the pairing code from World.");
    const s = [...sessions.values()].find((s) => sameCode(s.code, code));
    if (!s) throw new AppError(404, "Pairing code expired or already used.");
    s.links.add(owner(res));
    s.code = undefined;
    res.json({ id: s.id });
  });
  // The tab's own browser grants one of the person's running agent sessions:
  // never an agent (session(…, true) refuses one), never another person's run.
  router.post("/:id/grant", json, (req, res) => {
    const s = session(req, res, true),
      id = req.body?.run;
    if (typeof id !== "string" || !AGENT_SESSION_ID.test(id))
      throw new AppError(400, "Name the agent session to grant.");
    if (!ownsRun(id, owner(res)))
      throw new AppError(404, "That agent session is not running.");
    // A run that has ended is inert (its scope is gone); drop it here.
    for (const old of s.runs.keys())
      if (!ownsRun(old, s.owner)) s.runs.delete(old);
    s.runs.set(id, ++grants);
    res.json({ granted: true });
  });
  // The tab takes one grant back (World left while the grant was made).
  router.delete("/:id/grant/:run", (req, res) => {
    session(req, res, true).runs.delete(String(req.params.run));
    res.json({ revoked: true });
  });
  // A granted run finds its tab without a code. With two World views of the
  // same person granting the same run, the latest grant wins, deterministically;
  // only that person's own tabs can be candidates (`granted`).
  router.get("/granted", (_req, res) => {
    sweep();
    const run = (res.locals.agentScope as AgentScope | undefined)?.agentSession;
    const s = [...sessions.values()]
      .filter((s) => granted(s, res))
      .sort((a, b) => (b.runs.get(run!) ?? 0) - (a.runs.get(run!) ?? 0))[0];
    if (!s)
      throw new AppError(
        404,
        "No World tab has granted this session. Open World Builder in the studio while the session runs, or pair with World → Connect agents.",
      );
    res.json({ id: s.id });
  });
  router.delete("/:id", (req, res) => {
    const s = session(req, res, true);
    sessions.delete(s.id);
    res.json({ disconnected: true });
  });
  router.get("/:id/next", (req, res) => {
    const s = session(req, res, true);
    s.seen = Date.now();
    const command = [...s.commands.values()].find((c) => c.state === "queued");
    if (command) command.state = "running";
    res.json(command ? { id: command.id, command: command.command } : null);
  });
  router.post("/:id/commands", json, async (req, res) => {
    const s = session(req, res);
    if (Date.now() - s.seen > 10_000)
      throw new AppError(
        409,
        "World tab is not responding. Bring it to the foreground.",
      );
    const parsed = worldCommand.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "Invalid World command.");
    const command = parsed.data;
    if (command.op === "attach-media") {
      const prior = [...s.commands.values()].find(
        (c) =>
          c.caller === owner(res) &&
          c.command.op === "attach-media" &&
          c.command.requestId === command.requestId,
      );
      if (prior) {
        if (JSON.stringify(prior.command) !== JSON.stringify(command))
          throw new AppError(
            409,
            "That requestId names a different World media command.",
          );
        res.status(202).json({ id: prior.id, state: prior.state });
        return;
      }
    }
    let media: OwnedWorldMedia | undefined;
    if (command.op === "attach-media") {
      if (!projects)
        throw new AppError(
          503,
          "Project media is unavailable in this runtime.",
        );
      if (s.mediaReads >= 2)
        throw new AppError(
          429,
          "World is loading media. Wait for the current command.",
        );
      s.mediaReads++;
      try {
        media = await readWorldMedia(projects, owner(res), command);
      } finally {
        s.mediaReads--;
      }
      session(req, res); // Pairing may have expired during the project read.
      const prior = [...s.commands.values()].find(
        (c) =>
          c.caller === owner(res) &&
          c.command.op === "attach-media" &&
          c.command.requestId === command.requestId,
      );
      if (prior) {
        if (JSON.stringify(prior.command) !== JSON.stringify(command))
          throw new AppError(
            409,
            "That requestId names a different World media command.",
          );
        res.status(202).json({ id: prior.id, state: prior.state });
        return;
      }
    }
    session(req, res); // Recheck pairing after the asynchronous project read.
    if (
      media &&
      [...s.commands.values()].reduce(
        (total, c) => total + (c.media?.bytes.length ?? 0),
        media.bytes.length,
      ) +
        [...s.files.values()].reduce((total, f) => total + f.bytes.length, 0) >
        SESSION_BYTES
    )
      throw new AppError(
        413,
        "World pending inputs and capture files exceed 144 MiB.",
      );
    if (
      [...s.commands.values()].filter(
        (c) => c.state === "queued" || c.state === "running",
      ).length >= 16
    )
      throw new AppError(429, "World command queue is full.");
    while (s.commands.size >= 64) {
      const done = [...s.commands.values()].find(
        (c) => c.state === "done" || c.state === "error",
      );
      if (!done) break;
      s.commands.delete(done.id);
    }
    const c: Command = {
      id: randomUUID(),
      caller: owner(res),
      command: parsed.data,
      state: "queued",
      ...(media ? { media } : {}),
    };
    s.commands.set(c.id, c);
    res.status(202).json({ id: c.id, state: c.state });
  });
  router.get("/:id/commands/:command", (req, res) => {
    const s = session(req, res),
      c = s.commands.get(String(req.params.command));
    if (!c || (c.caller !== owner(res) && s.owner !== owner(res)))
      throw new AppError(404, "Command not found.");
    res.json({ id: c.id, state: c.state, result: c.result });
  });
  router.get("/:id/commands/:command/media", (req, res) => {
    const s = session(req, res, true),
      media = s.commands.get(String(req.params.command))?.media;
    if (!media) throw new AppError(404, "World command media unavailable.");
    res
      .set({
        "Content-Type": media.contentType,
        "Cache-Control": "no-store",
        "X-Content-SHA256": media.sha256,
      })
      .send(media.bytes);
  });
  router.post("/:id/commands/:command", json, (req, res) => {
    const s = session(req, res, true),
      c = s.commands.get(String(req.params.command));
    if (!c || c.state !== "running")
      throw new AppError(409, "Command is not awaiting a result.");
    if (!["done", "error"].includes(req.body?.state))
      throw new AppError(400, "Invalid command result.");
    c.state = req.body.state;
    c.result = req.body.result;
    c.media = undefined;
    res.json({ accepted: true });
  });
  router.post(
    "/:id/files/:file",
    (req, res, next) => {
      try {
        session(req, res, true);
        next();
      } catch (e) {
        next(e);
      }
    },
    express.raw({ type: () => true, limit: "64mb" }),
    (req, res) => {
      const s = session(req, res, true),
        file = String(req.params.file);
      if (!isFile(file)) throw new AppError(400, "Unknown clip file.");
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes))
        throw new AppError(400, "Upload file bytes.");
      const total = [...s.files].reduce(
        (n, [k, f]) => n + (k === file ? 0 : f.bytes.length),
        bytes.length,
      );
      if (
        total +
          [...s.commands.values()].reduce(
            (sum, command) => sum + (command.media?.bytes.length ?? 0),
            0,
          ) >
        SESSION_BYTES
      )
        throw new AppError(413, "Session files exceed 144 MB.");
      s.files.set(file, { bytes, type: WORLD_FILES[file] });
      res.json({ path: filePath(s.id, file), bytes: bytes.length });
    },
  );
  // The tab clears the last clip or take before uploading the next, so a
  // download never mixes passes from two takes.
  router.delete("/:id/files", (req, res) => {
    session(req, res, true).files.clear();
    res.json({ cleared: true });
  });
  router.get("/:id/files", (req, res) => {
    const s = session(req, res);
    res.json({
      files: [...s.files].map(([file, f]) => ({
        file,
        path: filePath(s.id, file),
        bytes: f.bytes.length,
      })),
    });
  });
  router.get("/:id/files/:file", (req, res) => {
    const s = session(req, res),
      file = s.files.get(String(req.params.file));
    if (!file) throw new AppError(404, "Clip file not found.");
    res
      .set({
        "Content-Type": file.type,
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${String(req.params.file)}"`,
      })
      .send(file.bytes);
  });
  return router;
}
