/**
 * "Describe the video" → the agent fills the panels.
 *
 * 1. A session still running is not interrupted (shown in the bubble), and a
 *    start already under way elsewhere is not joined: its prompt is not this
 *    description. Each Send starts at most one session.
 * 2. The local server issues a one-use code for this scroll and its panels
 *    (`/api/scrolls/fill`); the hosted studio has no such route and says so.
 * 3. The prompt is the description, the panels as they are and example pairs
 *    (`shared/scrolls/fill.ts`), started through the one spawn action.
 * 4. The tab collects the agent's panels and applies them as cell edits.
 *
 * Nothing here quotes, submits or retries: the person edits the panels and
 * presses Generate board, which quotes as usual.
 */
import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { applyScrollCommand } from "../../shared/scrolls/commands";
import {
  fillMessage,
  type FillExample,
  type PanelFill,
} from "../../shared/scrolls/fill";
import { cleanInstruction } from "../../shared/director/regenerate";
import type { ScrollAsset, ScrollDocument } from "../../shared/scrolls/types";
import { readAgentSession } from "../agent/api";
import { spawnFromStudio, spawnInFlight } from "../agent/spawn-store";
import { latestAgentSession, showAgentSession } from "../agent/useAgentSession";
import { scrollExamples } from "./example-catalog";

export type FillOutcome =
  | { kind: "sent"; session: AgentSession; requestId: string }
  | { kind: "closed" }
  | { kind: "busy"; session: AgentSession }
  | { kind: "starting" }
  | { kind: "local-only" };

export const LOCAL_ONLY =
  "Filling panels with Genobi needs the local studio (npm run dev); this studio has no agent hand-off for Scrolls.";
export const BUSY =
  "Genobi is still working in the session shown in the bubble. Send again once it finishes; your description stays here.";
export const STARTING =
  "Genobi is still starting from elsewhere. Nothing was sent; send again once it has started.";

export interface FillDeps {
  fetch: typeof fetch;
  spawn: typeof spawnFromStudio;
  inFlight: () => boolean;
  latest: () => AgentSession | undefined;
  show: (session: AgentSession) => void;
}
const live: FillDeps = {
  fetch: (...args) => fetch(...args),
  spawn: spawnFromStudio,
  inFlight: spawnInFlight,
  latest: latestAgentSession,
  show: showAgentSession,
};

/**
 * The example pairs: the picked references with the prompts they were made
 * from; when none recorded one, a storyboard plan from the catalogue, so the
 * agent still sees how panels are written.
 */
export function fillExamples(
  document: ScrollDocument,
  references: readonly ScrollAsset[],
): FillExample[] {
  const picked = references.map((a) => ({
    name: a.name,
    ...(a.prompt ? { prompt: a.prompt } : {}),
  }));
  if (picked.some((e) => e.prompt) || document.kind !== "storyboard")
    return picked;
  const plan = scrollExamples.find((e) => e.plan)!;
  return [
    ...picked,
    { name: plan.name, prompt: plan.plan!.prompt, shots: plan.plan!.shots },
  ];
}

/** Send: throws an Error whose message is safe to show. */
export async function askToFill(
  description: string,
  document: ScrollDocument,
  examples: readonly FillExample[],
  deps: Partial<FillDeps> = {},
): Promise<FillOutcome> {
  const { fetch, spawn, inFlight, latest, show } = { ...live, ...deps };
  if (!cleanInstruction(description))
    throw new Error("Describe the video first.");
  const last = latest();
  if (last && isAgentActive(last.status)) {
    show(last);
    return { kind: "busy", session: last };
  }
  if (inFlight()) return { kind: "starting" };
  const response = await fetch("/api/scrolls/fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: document.id,
      cellIds: document.cells.map((c) => c.id),
    }),
  });
  const body = (await response.json().catch(() => undefined)) as
    { id?: unknown; code?: unknown; error?: unknown } | undefined;
  if (response.status === 404 || response.status === 405 || !body)
    return { kind: "local-only" };
  if (
    !response.ok ||
    typeof body.id !== "string" ||
    typeof body.code !== "string"
  )
    throw new Error(
      typeof body.error === "string"
        ? body.error.slice(0, 200)
        : "Could not ask for a fill.",
    );
  if (inFlight()) return { kind: "starting" };
  const session = await spawn({
    prompt: fillMessage({ description, document, examples, code: body.code }),
    source: "typed",
  });
  if (!session) return { kind: "closed" };
  return { kind: "sent", session, requestId: body.id };
}

/** The agent's panels once they arrive; `null` while waiting; `gone` after. */
export async function collectFill(
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ documentId: string; panels: PanelFill[] } | null | "gone"> {
  const response = await fetcher(
    `/api/scrolls/fill/${encodeURIComponent(requestId)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return "gone";
  if (!response.ok) return null;
  const body = (await response.json()) as {
    documentId?: string;
    panels: PanelFill[] | null;
  };
  return body.panels && body.documentId
    ? { documentId: body.documentId, panels: body.panels }
    : null;
}

export const FINISHED = "Genobi finished without sending panels.";

export type FillPoll =
  | { kind: "panels"; documentId: string; panels: PanelFill[] }
  | { kind: "waiting" }
  | { kind: "gone" }
  /** The session ended and no panels came: stop waiting. */
  | { kind: "finished" };

/**
 * One wait step: the panels if they arrived; otherwise, once the session
 * the Send started has ended, one last read and then `finished`, so the tab
 * stops polling rather than waiting out the request's 20 minutes.
 */
export async function pollFill(
  requestId: string,
  sessionId: string,
  deps: {
    collect?: typeof collectFill;
    session?: (id: string) => Promise<AgentSession>;
  } = {},
): Promise<FillPoll> {
  const collect = deps.collect ?? ((id: string) => collectFill(id));
  const session = deps.session ?? ((id: string) => readAgentSession(id));
  const read = async (): Promise<FillPoll | undefined> => {
    const got = await collect(requestId);
    if (got === "gone") return { kind: "gone" };
    return got ? { kind: "panels", ...got } : undefined;
  };
  const first = await read();
  if (first) return first;
  if (isAgentActive((await session(sessionId)).status))
    return { kind: "waiting" };
  // Panels sent just before the session ended are still collected.
  return (await read()) ?? { kind: "finished" };
}

/**
 * The panels as ordinary revision-checked cell edits, each merged into the
 * cell as it is now, so its image, timing and region stay. A cell removed
 * since the Send is skipped.
 */
export function applyPanels(
  document: ScrollDocument,
  panels: readonly PanelFill[],
): { document: ScrollDocument; filled: number } {
  let next = document,
    filled = 0;
  for (const { cellId, ...fields } of panels) {
    const cell = next.cells.find((c) => c.id === cellId);
    if (!cell) continue;
    next = applyScrollCommand(next, {
      op: "cell",
      revision: next.revision,
      cell: { ...cell, ...fields },
    });
    filled++;
  }
  return { document: next, filled };
}
