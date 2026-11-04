/**
 * Make it with the agent (Make my version, 4 November 2026): the person's
 * dropped reference, imported into the draft, is committed as an undoable edit;
 * the server's copy is saved so the agent can see it; then one agent session
 * starts on the project with the template's skill, as the gallery's Generate
 * now starts one. Nothing here quotes or pays: the agent quotes each paid
 * step and the person approves it in the Genobi log.
 */
import type { AgentSession } from "../../shared/agent-session";
import type { HouseTemplate } from "../../shared/templates/types";
import type { VersionSlot } from "../../shared/templates/version";
import {
  versionAgentPrompt,
  type VersionAgentAsset,
} from "../../shared/templates/version-agent";
import { TEMPLATE_ACCEPT } from "../../shared/templates/intake";
import { spawnFromStudio } from "../agent/spawn-store";
import {
  COPY_NOT_SAVED,
  COPY_WAIT_MS,
} from "../template-gallery/template-actions";
import type { Bundle } from "./bundle";
import { saveCopies } from "./leave-guard";
import { importVersionFiles } from "./version-inputs";

export type AgentKind = VersionAgentAsset["kind"];

/** The kinds a template's Make my version slots accept, in a fixed order. */
export function agentKinds(slots: readonly Pick<VersionSlot, "kind">[]) {
  const kinds = new Set(slots.map((slot) => slot.kind));
  return (["image", "video", "audio"] as const).filter((k) => kinds.has(k));
}

const ACCEPT: Record<AgentKind, string> = {
  ...TEMPLATE_ACCEPT,
  video: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
};
export const agentAccept = (kinds: readonly AgentKind[]) =>
  kinds.map((kind) => ACCEPT[kind]).join(",");

const WORD = { image: "an image", video: "a clip", audio: "a track" };
/** "an image, a clip or a track", for the drop zone's hint and refusal. */
export function kindWords(kinds: readonly AgentKind[]) {
  const words = kinds.map((kind) => WORD[kind]);
  return words.length > 1
    ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`
    : (words[0] ?? "");
}

/** Said when the person closed the spawn dialog after the file was added. */
export const AGENT_CANCELLED =
  "Nothing started. Your reference stays in the project's assets; Undo removes it.";

/** Said when the studio keeps no project copy the agent could read. */
export const AGENT_NO_COPY =
  "This studio keeps no project copy, so an agent could not see your reference. Make it with the agent needs the local studio (npm run dev).";

/** Said beside the button while no agent is set up on this server. */
export const AGENT_SETUP_HINT =
  "No agent is set up yet. Make it with the agent walks you through choosing and signing one in, then starts it with your reference.";

/** The panel asks this first when the open version has edits. */
export const agentQuestion = (name: string) =>
  `Make it with the agent hands the open ${name} version, your edits included, to the agent, which changes it in the studio and in the server's copy; Undo keeps the old one in the studio. Continue?`;

/**
 * Imports one dropped file into the draft, proved by its bytes through the
 * version-inputs path, with no layer of the cut bound to it: it is the
 * person's reference, which steers the look (an image is kept as a
 * reference asset), not a file swapped into the video.
 */
export async function importAgentFile(
  draft: Bundle,
  kinds: readonly AgentKind[],
  file: File,
) {
  const kind = (["image", "video", "audio"] as const).find((k) =>
    file.type.startsWith(`${k}/`),
  );
  if (!kind || !kinds.includes(kind))
    throw new Error(`Drop ${kindWords(kinds)}.`);
  const slot: VersionSlot = {
    id: "agent",
    label: "Your reference",
    kind,
    min: 1,
    max: 1,
    hint: "",
    layers: [],
  };
  const imported = await importVersionFiles(
    draft,
    slot,
    [file],
    kind === "image" ? "reference" : "production",
  );
  const id = imported.assetIds[0];
  const path = imported.bundle.project.assets[id].file.path;
  const asset: VersionAgentAsset = {
    id,
    name: path.split("/").pop() ?? "media",
    kind,
  };
  return { bundle: imported.bundle, asset };
}

export interface VersionAgentDeps {
  save: typeof saveCopies;
  spawn: typeof spawnFromStudio;
}
const live: VersionAgentDeps = { save: saveCopies, spawn: spawnFromStudio };

/**
 * Commits the draft holding the reference (when one was dropped), waits for
 * the server's copy, then starts the agent with the source the sentence came
 * by. Nothing starts unless the copy confirmed, since the agent would
 * otherwise link a copy without what its prompt names. Resolves with the
 * session, or undefined when the person closed the dialog.
 */
export async function startVersionAgent(
  {
    template,
    draft,
    asset,
    withWhat,
    source,
    commit,
  }: {
    template: HouseTemplate;
    draft: Bundle;
    asset?: VersionAgentAsset;
    withWhat: string;
    source: "voice" | "typed";
    commit: (next: Bundle) => unknown;
  },
  deps: Partial<VersionAgentDeps> = {},
): Promise<AgentSession | undefined> {
  const { save, spawn } = { ...live, ...deps };
  // Refuses an empty or overlong sentence before anything is committed.
  const prompt = versionAgentPrompt(template, asset, withWhat);
  if (asset) {
    if (!draft.project.assets[asset.id])
      throw new Error("Drop your reference again; it is not in this draft.");
    commit(draft);
  }
  if (!(await save(COPY_WAIT_MS))) throw new Error(COPY_NOT_SAVED);
  return spawn({ prompt, source });
}
