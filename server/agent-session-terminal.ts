// An agent session started with `mode: "terminal"` (server/agent-sessions.ts):
// the harness opens in a Terminal window the person drives. There is no
// process of ours to read or end, so the session follows the launcher's
// receipt, and its grant ties the window's quotes to this session's
// approvals, which the bubble shows. No time limit: the window is theirs.
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
import { RUNNERS, shuttingDown } from "./agent-runner-table";
import type { SessionPlanInput } from "./agent-runner";
import { pushLine } from "./agent-session-end";
import type { AgentSessionsOptions, Running } from "./agent-session-types";
import {
  terminalPlan,
  watchTerminal,
  type AgentTerminal,
} from "./agent-terminal";

/** The files that name the grant, the brief or the person's words. */
const PRIVATE_FILES = ["mcp.json", "plan.json", "prompt.txt"];

/**
 * Clears a Terminal session's private folder: all of it once the receipt
 * came (or the open failed), or, while the window may still be open (Stop,
 * shutdown), only the files holding the grant, plan and prompt, so the
 * launcher can still write its receipt.
 */
export async function releaseTerminal(session: Running, whole: boolean) {
  const folder = session.terminalFolder;
  if (!folder) return;
  if (whole) {
    session.terminalFolder = undefined;
    await rm(folder, { recursive: true, force: true });
  } else
    await Promise.all(
      PRIVATE_FILES.map((name) => rm(path.join(folder, name), { force: true })),
    );
}

/**
 * Stop: the grant, plan and prompt go now; the rest of the folder goes when
 * the window's receipt arrives (the window is the person's, and may stay
 * open for a long time). A server stopped before then sweeps it at start.
 */
export function releaseAfterStop(session: Running) {
  const folder = session.terminalFolder;
  void releaseTerminal(session, false);
  if (!folder) return;
  watchTerminal(path.join(folder, "status.json"), () => {
    if (session.terminalFolder === folder) session.terminalFolder = undefined;
    void rm(folder, { recursive: true, force: true });
  });
}

/**
 * At server start: removes the folders of Terminal sessions whose window
 * has since closed (`status.json` says closed or failed). A server that just
 * started follows no session, so none of them is live; a folder without a
 * receipt is a window still open and is kept. Supervisor sessions' folders
 * (no `agent-` prefix) are never touched.
 */
export async function sweepTerminalFolders(terminal: AgentTerminal) {
  const prefix = path.basename(terminal.agentFolder(""));
  const root = path.dirname(terminal.agentFolder(""));
  const names = await readdir(root).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.startsWith(prefix) && name.length > prefix.length)
      .map(async (name) => {
        const folder = path.join(root, name);
        const status = await readFile(path.join(folder, "status.json"), "utf8")
          .then((text) => (JSON.parse(text) as { status?: unknown }).status)
          .catch(() => undefined);
        if (status === "closed" || status === "failed")
          await rm(folder, { recursive: true, force: true });
      }),
  );
}

export const terminalRefused = () =>
  new AppError(
    400,
    "This server cannot open a Terminal window. Run the session in the bubble instead.",
    "agent_terminal",
  );

/**
 * Builds the plan, opens the window and starts following its receipt. When
 * the harness exits, `ended` settles the session as a runner's exit would:
 * done (or waiting on a quoted step) for a clean exit, failed otherwise.
 */
export async function openTerminalSession(
  options: Pick<AgentSessionsOptions, "terminal" | "terminalPlan" | "config">,
  session: Running,
  input: SessionPlanInput,
  hooks: { closing: () => boolean; ended: (code: number) => void },
) {
  const terminal = options.terminal;
  const { id, runner } = session.view;
  if (!terminal?.supported) throw terminalRefused();
  const plan = await (options.terminalPlan ?? terminalPlan)(
    runner,
    options.config,
    input,
    terminal.agentFolder(id),
  );
  if (hooks.closing()) throw shuttingDown();
  session.terminalFolder = terminal.agentFolder(id);
  const opened = await terminal.openAgent(
    id,
    runner,
    plan.command,
    plan,
    plan.files,
  );
  session.grant = plan.grant;
  session.view.status = "running";
  const label = RUNNERS[runner].label;
  pushLine(
    session,
    plan.signIn
      ? `${label} is open in Terminal and signs in there first; the chat starts in the same window. Its paid steps wait here for your approval.`
      : `${label} is open in Terminal. Its paid steps wait here for your approval.`,
  );
  session.unwatch = watchTerminal(
    opened.statusFile,
    (end) => {
      session.unwatch = undefined;
      session.finished = end === "closed" ? "done" : "failed";
      hooks.ended(end === "closed" ? 0 : 1);
    },
    undefined,
    // The window reports its sign-in; the studio's next read shows it.
    () => pushLine(session, `${label} is signed in. The chat is starting.`),
  );
}
