import { readUsage, readSelection } from "../licensing/preferences";
import { useEffect } from "react";
import {
  addPick,
  parseAgentContext,
  PICK_NAME_MAX,
  plainText,
  type AgentContext,
  type AgentPick,
  type AgentSettings,
} from "../../shared/agent-context";
import { isImage } from "../../shared/image";
import { DIRECTOR_ID } from "../../shared/director/commands";
import type { Job } from "../../shared/types";
import type { Project } from "../../shared/director/types";
import { composerInput, type ComposerState } from "../useComposer";
import { useSettingsStore } from "../settings-store";
import { studioStore, type StudioState } from "../studio/store";
import { resolvePreferences } from "../../shared/licensing/project-preferences";
import { projectDirection } from "../../shared/agent-context-direction";
import { currentWorld } from "./world-context";

/**
 * What the studio tells an agent session about the person's work (issue #23,
 * "Picks and context"): the takes and assets they picked, newest first, and
 * what the composer holds. Kept in memory for this page only, never stored or
 * logged, and holding no key: a session start reads it once
 * (`startAgentSession`).
 *
 * A pick is a choice the person made on screen: a gallery take's title (which
 * loads that run into the composer), or an asset selected in the Director,
 * directly or by selecting the clip that uses it.
 */
let picks: AgentPick[] = [];
let settings: AgentSettings | undefined;

/** A gallery take the person chose. */
export function takePick(job: Job): AgentPick {
  return {
    kind: "take",
    id: job.id,
    media: job.mediaType ?? (isImage(job.generator) ? "image" : "video"),
    name: plainText(job.description || "Untitled study", PICK_NAME_MAX),
  };
}

/** A Director asset the person selected; undefined for an unknown id. */
export function assetPick(
  project: Project | undefined,
  id: string,
): AgentPick | undefined {
  const asset = project?.assets[id];
  if (!asset || !DIRECTOR_ID.test(id) || !DIRECTOR_ID.test(project.id))
    return undefined;
  // The file name only: the project's own path, never a folder.
  const file = asset.file.path.split(/[\\/]/).pop() ?? id;
  return {
    kind: "asset",
    id,
    media: asset.kind,
    name: plainText(file, PICK_NAME_MAX) || id,
    projectId: project.id,
  };
}

/** Records a pick as the newest; a repeat moves to the front. */
export function notePick(pick: AgentPick | undefined) {
  if (pick) picks = addPick(picks, pick);
}

/**
 * Follows the Director's selections: each asset the person selects, directly
 * or through its clip, is a pick. Returns the unsubscribe.
 */
export function followDirectorPicks(store: {
  getState: () => Pick<StudioState, "actions">;
}) {
  // Each explicit selection, the same asset again included; other store
  // updates (an edit, an undo, the drawer) record nothing.
  return store
    .getState()
    .actions.onAssetSelect((id, project) => notePick(assetPick(project, id)));
}

/**
 * The composer's settings, as the request Generate would send: generator, model
 * and every field from `composerInput` (so an Upscale after LTX names the
 * registry's upscale model, and Acoustic Space keeps its treatment), without
 * the prompt text, image references or camera wording. LTX's Light and
 * filled gaps are added for the agent to read.
 */
export function composerSettings(
  state: ComposerState,
  sourceId?: string,
): AgentSettings {
  // The clip Generate would upscale: the chosen one, or the one App resolved
  // (the latest Ready video) when none was chosen.
  const input = composerInput({
    ...state,
    sourceId: sourceId ?? state.sourceId,
  });
  const base = {
    generator: input.generator,
    model: input.model ?? "flux-3",
  };
  if (isImage(input.generator))
    return {
      ...base,
      ...(input.imageResolution
        ? { imageResolution: input.imageResolution }
        : {}),
      ...(input.imageAspectRatio
        ? { imageAspectRatio: input.imageAspectRatio }
        : {}),
      ...(input.imageGrounding !== undefined
        ? { imageGrounding: input.imageGrounding }
        : {}),
      ...(input.imageSafetyTolerance !== undefined
        ? { imageSafetyTolerance: input.imageSafetyTolerance }
        : {}),
      cameraEnabled: input.cameraEnabled,
      ...(input.cameraEnabled && input.camera
        ? { camera: { ...input.camera } }
        : {}),
    };
  const gaps = Object.fromEntries(
    Object.entries(state.slots).filter(([, text]) => text.trim()),
  );
  const video = input.generator === "video";
  return {
    ...base,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    draft: input.draft,
    cameraEnabled: input.cameraEnabled,
    ...(input.camera ? { camera: { ...input.camera } } : {}),
    upscaleFactor: input.upscaleFactor,
    upscaleCreativity: input.upscaleCreativity,
    ...(input.generator === "upscale" && input.sourceId
      ? {
          sourceId: input.sourceId,
          ...(input.upscalePrompt?.trim()
            ? { upscalePrompt: input.upscalePrompt.trim() }
            : {}),
        }
      : {}),
    ...(input.acoustic ? { acoustic: input.acoustic } : {}),
    ...(video ? { light: { ...state.light } } : {}),
    ...(video && Object.keys(gaps).length ? { gaps } : {}),
  };
}

/** Records what the composer holds. */
export function noteSettings(next: AgentSettings) {
  settings = next;
}

/**
 * The studio publishes what Generate would send as it changes: the
 * composer's state with the upscale source App resolved (`upscaleSource`).
 */
export function useAgentSettings(state: ComposerState, sourceId?: string) {
  useEffect(
    () => noteSettings(composerSettings(state, sourceId)),
    [state, sourceId],
  );
}

/**
 * The context a session starts with: validated by the same parser the server
 * runs, so a value the server would refuse is left out here rather than
 * failing the start. Undefined when there is nothing to tell.
 */
export function studioContext(): AgentContext | undefined {
  const location = useSettingsStore.getState().location;
  const runLocation =
    location === "local" || location === "cloud" ? location : undefined;
  const studio = studioStore.getState();
  const project = studio.director.bundle?.project;
  const { usage, selection } = resolvePreferences(
    { usage: readUsage(), selection: readSelection() },
    project?.preferences,
  );
  const direction = projectDirection(project, studio.workspace.selected);
  const world = currentWorld();
  const draft = {
    picks,
    ...(usage ? { usage } : {}),
    ...(selection ? { selection } : {}),
    ...(settings
      ? { settings: { ...settings, ...(runLocation ? { runLocation } : {}) } }
      : {}),
    ...(direction ? { direction } : {}),
    ...(world ? { world } : {}),
  };
  if (
    !draft.picks.length &&
    !draft.settings &&
    !usage &&
    !selection &&
    !direction &&
    !world
  )
    return undefined;
  try {
    return parseAgentContext(draft);
  } catch {
    try {
      return parseAgentContext({
        picks,
        ...(usage ? { usage } : {}),
        ...(selection ? { selection } : {}),
        ...(direction ? { direction } : {}),
        ...(world ? { world } : {}),
      });
    } catch {
      return undefined;
    }
  }
}

/** Tests start from nothing. */
export function resetStudioContext() {
  picks = [];
  settings = undefined;
}
