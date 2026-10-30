/**
 * The Editor's Regenerate (beside Render MP4) and the Send to Genobi of the
 * Global prompt and the clip inspector: the person's instruction and their edits handed to the agent,
 * which works on the linked project again. In this order:
 *
 * 1. A session still running is not interrupted: the bubble shows it and the
 *    person sends again once it finishes. Sessions take one turn each. A
 *    start already under way elsewhere (the bubble, the gallery) is not
 *    joined either: its prompt is not this instruction.
 * 2. A studio that keeps no project copy (the hosted one) cannot hand the
 *    edits over, and says so before anything else is asked.
 * 3. The one spawn action (`spawnFromStudio`) gets the agent ready: with
 *    none chosen or signed in, it walks the person through choosing and
 *    signing one in. Setup comes before the save on purpose: an owner with
 *    no agent sees the setup, not a copy message, and the instruction stays
 *    in its field throughout, so it is sent without retyping.
 * 4. Once the agent is ready (`writePrompt`), the copy must hold the current
 *    revision (`saveOpenCopy`, the wordmark's save), so the agent reads the
 *    person's edits rather than an older copy. Send waits for a save that is
 *    still out (`SAVE_WAIT_MS`); a revision the local server refused is
 *    reported with the server's reason at once, since waiting cannot fix it
 *    (a server started before an update refuses fields it does not know).
 * 5. The prompt is the instruction plus the project's feedback and timeline
 *    (`shared/director/regenerate.ts`). When the last session this page
 *    started was on this project, it says this is that session's next turn.
 *
 * Nothing here quotes, submits or retries: the agent quotes each paid step
 * and the person approves it in the bubble. A refusal is shown, not repeated.
 */
import { findMixTemplate } from "../../shared/templates/catalogue";
import {
  mixUpscaleLine,
  mixUpscaleStep,
} from "../../shared/templates/mix-upscale";
import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { regenerateMessage } from "../../shared/director/regenerate";
import { PromptWithheld } from "../agent/spawn";
import {
  sessionProject,
  spawnFromStudio,
  spawnInFlight,
} from "../agent/spawn-store";
import { latestAgentSession, showAgentSession } from "../agent/useAgentSession";
import { studioStore } from "../studio/store";
import type { Bundle } from "./bundle";
import { feedbackOf } from "./feedback-file";
import { saveOpenCopy, type CopyProblem } from "./leave-guard";
import { copyAvailable } from "./project-copy";

/**
 * How long Send waits for a save still out to confirm the last edit. A
 * local push takes well under a second; this only bounds a server that
 * stopped answering. A refusal answers at once.
 */
export const SAVE_WAIT_MS = 30_000;

export type RegenerateOutcome =
  /** Started with the project linked; `turn` says whether it continues one. */
  | { kind: "sent"; session: AgentSession; turn: "next" | "new" }
  /** The person closed the spawn dialog; nothing started. */
  | { kind: "closed" }
  /** A session is still running; it is shown in the bubble. */
  | { kind: "busy"; session: AgentSession }
  /** Another start (the bubble's, the gallery's) is still under way. */
  | { kind: "starting" }
  /** This studio keeps no project copy for the agent to read. */
  | { kind: "no-copy" }
  /** The project copy did not take the current revision, and why. */
  | { kind: "unsaved"; problem: CopyProblem };

export interface RegenerateDeps {
  bundle: () => Bundle | undefined;
  save: typeof saveOpenCopy;
  copy: () => Promise<boolean>;
  spawn: typeof spawnFromStudio;
  inFlight: () => boolean;
  latest: () => AgentSession | undefined;
  startedOn: (sessionId: string) => string | undefined;
  show: (session: AgentSession) => void;
}
const live: RegenerateDeps = {
  bundle: () => studioStore.getState().director.bundle,
  save: saveOpenCopy,
  copy: () => copyAvailable(),
  spawn: spawnFromStudio,
  inFlight: spawnInFlight,
  latest: latestAgentSession,
  startedOn: sessionProject,
  show: showAgentSession,
};

/** Said for each outcome, in the Editor's popover. */
export function unsavedText(problem: CopyProblem) {
  const kept = "Nothing was sent; your words stay here.";
  switch (problem.kind) {
    case "refused":
      return `The local server refused your latest edit, so the agent would not see it: ${problem.message} ${kept} A server started before an update refuses what it does not know yet: restart it (Restart local server, or npm run dev again), then send.`;
    case "unreachable":
      return `The local server did not answer when your latest edit was saved, so the agent would not see it. ${kept} Check that npm run dev is still running, then send again.`;
    case "replaced":
      return `An agent's change replaced your latest edit in the project copy. ${kept} Keep yours or theirs in the Editor's question first, then send.`;
    case "none":
      return `This page is not connected to the project copy (the local server was not answering when it opened). ${kept} Reload the page, then send.`;
    case "slow":
      return `Your latest edit was still saving after ${SAVE_WAIT_MS / 1000} seconds, so the agent would not see it. ${kept} Send again once the local server answers.`;
  }
}
export const NO_COPY =
  "This studio keeps no project copy, so an agent could not read your edits. Regenerate needs the local studio (npm run dev).";
export const STARTING =
  "Genobi is still starting from elsewhere. Nothing was sent; your words are kept here, so send again once it has started.";
export const BUSY =
  "Genobi is still working in the session shown in the bubble. Send again once it finishes, or Stop it there; your instruction stays here.";

/** A mix project's optional upscale step, for the agent to offer, not run. */
function mixStepOf(projectId: string) {
  const template = findMixTemplate(projectId);
  const step = template && mixUpscaleStep(template);
  return step ? { optionalStep: mixUpscaleLine(step) } : {};
}

/** The prompt for this instruction and the open project, as Send writes it. */
export function regeneratePrompt(
  instruction: string,
  bundle: Bundle,
  previous?: AgentSession,
) {
  return regenerateMessage({
    instruction,
    project: bundle.project,
    feedback: feedbackOf(bundle),
    ...mixStepOf(bundle.project.id),
    ...(previous
      ? {
          previous: {
            status: previous.status,
            ...(previous.summary ? { summary: previous.summary } : {}),
          },
        }
      : {}),
  });
}

/** Send: throws an Error whose message is safe to show (the spawn's refusal). */
export async function regenerate(
  instruction: string,
  deps: Partial<RegenerateDeps> = {},
): Promise<RegenerateOutcome> {
  const { bundle, save, copy, spawn, inFlight, latest, startedOn, show } = {
    ...live,
    ...deps,
  };
  const open = bundle();
  if (!open) throw new Error("Open a project in the Editor first.");
  const last = latest();
  if (last && isAgentActive(last.status)) {
    show(last);
    return { kind: "busy", session: last };
  }
  // Refuses an empty instruction before anything is saved or started.
  const unsaved = regeneratePrompt(instruction, open);
  // Never joined: a shared spawn would carry another caller's prompt.
  if (inFlight()) return { kind: "starting" };
  if (!(await copy())) return { kind: "no-copy" };
  let previous: AgentSession | undefined;
  /** Runs once the agent is ready: the save, then the prompt from it. */
  const writePrompt = async () => {
    const answer = await save(SAVE_WAIT_MS);
    if (!answer.saved)
      throw new PromptWithheld<RegenerateOutcome>({
        kind: "unsaved",
        problem: answer.problem,
      });
    // The copy now holds the store's revision: write the prompt from it.
    const saved = bundle() ?? open;
    previous =
      last && startedOn(last.id) === saved.project.id ? last : undefined;
    return regeneratePrompt(instruction, saved, previous);
  };
  try {
    const session = await spawn({
      prompt: unsaved,
      writePrompt,
      source: "typed",
    });
    if (!session) return { kind: "closed" };
    return { kind: "sent", session, turn: previous ? "next" : "new" };
  } catch (error) {
    if (error instanceof PromptWithheld)
      return error.reason as RegenerateOutcome;
    throw error;
  }
}
