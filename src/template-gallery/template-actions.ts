/**
 * The gallery drawer's actions for an agent template (Box 1.6 decision 5,
 * built in Box 2.2); a mechanical template's Generate is `mechanical-run.ts`:
 *
 * - **Generate now** opens the template with the person's references as
 *   project assets, waits for the local server's copy of it, then starts the
 *   agent through the one spawn action (`spawnFromStudio`, which links the
 *   open project) with the template's skill and the intake as its first turn.
 * - **Take it to Director** is the `/director?example=<id>` path, with the
 *   person's references when they changed any.
 * - **Take it to the editor**, once a session exists (or always, for a
 *   mechanical template), opens the template's project in the Editor.
 *
 * Nothing here quotes or pays: the agent quotes each paid step and the
 * person approves it in the studio.
 */
import type { AgentSession } from "../../shared/agent-session";
import { directorLink } from "../../shared/gallery/catalogue";
import { intakePrompt } from "../../shared/templates/intake";
import { readInputs } from "../../shared/templates/plan";
import type { HouseTemplate } from "../../shared/templates/types";
import { spawnFromStudio } from "../agent/spawn-store";
import { saveCopies } from "../director/leave-guard";
import type { StudioState } from "../studio/store";
import { openTemplate, type TemplatePicks } from "./open-template";

/** A studio address the shell routes on `popstate`, as gallery links do. */
export function go(url: string) {
  history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const editorLink = (id: string) =>
  `${directorLink(id)}&workspace=editor`;

/** How long Generate now waits for the project copy before it starts anyway. */
export const COPY_WAIT_MS = 5000;

export interface ActionDeps {
  open: typeof openTemplate;
  save: typeof saveCopies;
  spawn: typeof spawnFromStudio;
  navigate: (url: string) => void;
}
const live: ActionDeps = {
  open: openTemplate,
  save: saveCopies,
  spawn: spawnFromStudio,
  navigate: go,
};

const changed = ({ picks, inputs }: TemplatePicks) =>
  !!inputs || Object.values(picks).some((state) => state !== "example");

export interface GenerateOutcome {
  /** Undefined when the person closed the spawn dialog. */
  session?: AgentSession;
}

/**
 * Whether Generate now would replace work: it rebuilds the template's
 * project over the open one (or its kept draft), so an agent session on it,
 * or edits in its undo history, are replaced in the studio and on the
 * server's copy. The gallery asks first when this is true.
 */
export function replacesWork(
  director: Pick<StudioState["director"], "bundle" | "history" | "drafts">,
  id: string,
  session: boolean,
) {
  const open = director.bundle?.project.id === id;
  const edited = open
    ? director.history.length > 0
    : (director.drafts[id]?.history.length ?? 0) > 0;
  return (open || !!director.drafts[id]) && (session || edited);
}

export const replaceQuestion = (name: string) =>
  `Generate now rebuilds the ${name} project with these references. It replaces the open version, an agent's cut included, in the studio and in the server's copy; Undo keeps the old one in the studio. Continue?`;

/** Said when the person closed the spawn dialog after the template opened. */
export const CANCELLED_SPAWN =
  "Nothing started; the template is open in Director (undo to go back).";

/** Said when the server's copy did not confirm the project in time. */
export const COPY_NOT_SAVED = "The project copy did not save; try again.";

/**
 * Generate now: the project with the references, then the agent on it.
 * Nothing starts unless the server's copy confirmed it holds this project:
 * otherwise the agent would link an older copy, or none, while its prompt
 * describes references it cannot see.
 */
export async function generateNow(
  template: HouseTemplate,
  chosen: TemplatePicks,
  deps: Partial<ActionDeps> = {},
): Promise<GenerateOutcome> {
  const { open, save, spawn } = { ...live, ...deps };
  // Refuses picks and a brief the template cannot take before anything opens.
  const brief = chosen.inputs && readInputs(template, chosen.inputs).subject;
  const prompt = intakePrompt(template, chosen.picks, brief);
  await open(template.id, chosen);
  if (!(await save(COPY_WAIT_MS))) throw new Error(COPY_NOT_SAVED);
  const session = await spawn({ prompt, source: "typed" });
  return { session };
}

/** Take it to Director: today's path, with the references when changed. */
export async function takeToDirector(
  template: HouseTemplate,
  chosen: TemplatePicks,
  deps: Partial<ActionDeps> = {},
) {
  const { open, navigate } = { ...live, ...deps };
  await open(template.id, changed(chosen) ? chosen : undefined);
  navigate(directorLink(template.id));
}

/**
 * Take it to the editor: the project the session works on (the template's,
 * open or kept as a draft), in the Editor. From a mechanical template, which
 * has no session, the person's references come along when they changed any.
 */
export async function takeToEditor(
  template: HouseTemplate,
  deps: Partial<ActionDeps> = {},
  chosen?: TemplatePicks,
) {
  const { open, navigate } = { ...live, ...deps };
  await open(template.id, chosen && changed(chosen) ? chosen : undefined);
  navigate(editorLink(template.id));
}
