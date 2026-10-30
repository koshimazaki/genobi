// Local only, like the media tools and voice: the inference keys this server
// holds, and whether an agent runner is set up. The hosted Worker answers 404
// here, and its visitors keep their key in page memory.
import { access, constants } from "node:fs/promises";
import path from "node:path";
import express, { type Response } from "express";
import { AppError } from "./errors";
import { KEY_KINDS, type ServerKeys } from "./keys";
import type { KeyKind } from "../shared/provider";
import type { RateBucket } from "../shared/limits";

/**
 * The agent harnesses setup offers. Each signs in through its own setup, and
 * Genobi stores no agent key: it only looks for the command on `PATH`. Codex
 * is listed so setup can show it; the studio cannot run it as a runner yet.
 */
export const AGENT_RUNNERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    setup: "Run claude and sign in with /login.",
  },
  {
    id: "hermes",
    name: "Hermes",
    command: "hermes",
    setup: "Run hermes model to choose a provider and sign in.",
  },
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    setup: "Run codex login to sign in.",
  },
] as const;

/** Whether an executable of this name is on `PATH`. Nothing is run. */
export type FindCommand = (command: string) => Promise<boolean>;
export const onPath: FindCommand = async (command) => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter))
    if (directory)
      try {
        await access(path.join(directory, command), constants.X_OK);
        return true;
      } catch {
        /* Not in this directory. */
      }
  return false;
};

export function keyRouter(
  keys: ServerKeys,
  limit: (bucket: RateBucket, id: string) => void,
  findCommand: FindCommand = onPath,
  /** Whether a run on the saved key in this slot is still finishing. */
  finishing: (kind: KeyKind) => boolean = () => false,
) {
  const router = express.Router();
  const session = (response: Response) => response.locals.sessionId as string;
  const slot = (value: string): KeyKind => {
    const kind = KEY_KINDS.find((item) => item === value);
    if (!kind) throw new AppError(404, "API route not found.");
    return kind;
  };
  // A paid run still finishing is polled with this slot's key; another key
  // could read it as lost before its output is saved.
  const changeable = (kind: KeyKind) => {
    if (finishing(kind))
      throw new AppError(
        409,
        "A run is still finishing on this key. Replace or remove it once that run is saved.",
        "key_in_use",
      );
    return kind;
  };
  router.get("/keys", (_request, response) => {
    limit("history", session(response));
    response.json({ keys: keys.status() });
  });
  router.get("/keys/bfl/dashboard", async (_request, response) => {
    limit("history", session(response));
    response.json({ available: await keys.hasBflDashboardKey() });
  });
  router.put("/keys/bfl/dashboard", async (_request, response) => {
    limit("submit", session(response));
    if (response.locals.agent)
      throw new AppError(
        403,
        "Connect the BFL Dashboard key from studio Settings.",
        "key_owner_required",
      );
    await keys.changing("bfl", async () => {
      const value = await keys.bflDashboardKey();
      if ((await keys.held("bfl")) && !keys.holds("bfl", value))
        changeable("bfl");
      await keys.save("bfl", value);
    });
    response.json({ keys: keys.status() });
  });
  // Each write starts the Keychain tool, so it counts with the paid writes.
  router.put(
    "/keys/:kind",
    express.json({ limit: "2kb" }),
    async (request, response) => {
      limit("submit", session(response));
      const body: unknown = request.body;
      const value =
        body && typeof body === "object" && "key" in body ? body.key : "";
      const kind = slot(request.params.kind);
      // The guard protects a key the slot holds. Filling an empty slot, or
      // entering the key it already holds, cannot strand a run.
      await keys.changing(kind, async () => {
        if ((await keys.held(kind)) && !keys.holds(kind, value))
          changeable(kind);
        await keys.save(kind, value);
      });
      response.json({ keys: keys.status() });
    },
  );
  router.delete("/keys/:kind", async (request, response) => {
    limit("submit", session(response));
    const kind = slot(request.params.kind);
    // Removing from an empty slot is a no-op; the Keychain is not touched.
    await keys.changing(kind, async () => {
      if (await keys.held(kind)) await keys.remove(changeable(kind));
    });
    response.json({ keys: keys.status() });
  });
  router.get("/agent/runners", async (_request, response) => {
    limit("history", session(response));
    response.json({
      runners: await Promise.all(
        AGENT_RUNNERS.map(async ({ id, name, command, setup }) => ({
          id,
          name,
          installed: await findCommand(command),
          setup,
        })),
      ),
    });
  });
  return router;
}
