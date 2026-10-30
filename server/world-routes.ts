/** Explicit, ephemeral pairing between one open World tab and local agents. */
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  WORLD_FILES,
  worldCommand,
  type WorldCommand,
  type WorldFile,
} from "../shared/world-control";
import { AppError } from "./errors";
import { sameCode } from "./pairing-code";
interface Command {
  id: string;
  caller: string;
  command: WorldCommand;
  state: "queued" | "running" | "done" | "error";
  result?: unknown;
}
interface Session {
  id: string;
  owner: string;
  code?: string;
  seen: number;
  links: Set<string>;
  commands: Map<string, Command>;
  files: Map<string, { bytes: Buffer; type: string }>;
}
/** A fixed take holds colour and depth passes, so the session allows two clips. */
const SESSION_BYTES = 144 * 1024 * 1024;
const isFile = (file: string): file is WorldFile =>
  Object.hasOwn(WORLD_FILES, file);
const filePath = (id: string, file: string) => `/api/world/${id}/files/${file}`;
export function worldRouter() {
  const router = express.Router(),
    sessions = new Map<string, Session>();
  const json = express.json({ limit: "128kb" });
  const owner = (res: express.Response) => res.locals.sessionId as string;
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
        : s.owner !== owner(res) && !s.links.has(owner(res)))
    )
      throw new AppError(
        404,
        "World session not found. Pair with the open tab first.",
      );
    return s;
  }
  router.post("/connect", json, (_req, res) => {
    sweep();
    if (res.locals.agent)
      throw new AppError(403, "Connect agents from the World tab.");
    for (const [id, s] of sessions)
      if (s.owner === owner(res)) sessions.delete(id);
    if (sessions.size >= 4)
      throw new AppError(429, "Four World tabs are already connected.");
    const s: Session = {
      id: randomUUID(),
      owner: owner(res),
      code: randomBytes(16).toString("hex"),
      seen: Date.now(),
      links: new Set(),
      commands: new Map(),
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
  router.post("/:id/commands", json, (req, res) => {
    const s = session(req, res);
    if (Date.now() - s.seen > 10_000)
      throw new AppError(
        409,
        "World tab is not responding. Bring it to the foreground.",
      );
    const parsed = worldCommand.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "Invalid World command.");
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
  router.post("/:id/commands/:command", json, (req, res) => {
    const s = session(req, res, true),
      c = s.commands.get(String(req.params.command));
    if (!c || c.state !== "running")
      throw new AppError(409, "Command is not awaiting a result.");
    if (!["done", "error"].includes(req.body?.state))
      throw new AppError(400, "Invalid command result.");
    c.state = req.body.state;
    c.result = req.body.result;
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
      if (total > SESSION_BYTES)
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
