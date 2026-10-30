import { withBrowserActivity } from "../activity/store";
import { scrollDuration, audioInterval } from "../../shared/scrolls/timing";
import { withEmptyStage } from "./empty-stage";
import type { Project, Asset, Layer } from "../../shared/director/types";
import { orderedSelection, timedCells } from "../../shared/scrolls/commands";
import { scrollHandoff } from "../../shared/scrolls/prompts";
import type { ScrollBundle } from "./bundle";
import type { Bundle } from "../director/bundle";
import { validateFiles } from "../director/bundle";
import { studioStore } from "../studio/store";
import { writeBrief } from "../director/prompt-brief";

/** One image layer per accepted panel. Character/style guidance stays off-screen. */
export function directorBundle(scroll: ScrollBundle, preview = false): Bundle {
  const d = scroll.document,
    ids = preview
      ? d.cells.flatMap((c) => (c.assetId ? [c.assetId] : []))
      : orderedSelection(d).map((a) => a.id);
  const picked = d.assets.filter(
    (a) =>
      ids.includes(a.id) || (d.timing.enabled && a.id === d.timing.audioId),
  );
  const assets: Record<string, Asset> = {},
    layers: Layer[] = [],
    generations: Project["generations"] = [];
  const durationFrames = scrollDuration(d);
  const audio = audioInterval(d);
  for (const a of picked) {
    const visible =
      d.timing.enabled &&
      a.role === "panel" &&
      d.cells.some((c) => c.assetId === a.id);
    const playingAudio = d.timing.enabled && a.id === d.timing.audioId;
    assets[a.id] = {
      kind: a.kind,
      use: visible || playingAudio ? "production" : "reference",
      origin: a.origin,
      file: a.file,
      ...(a.durationSeconds ? { durationSeconds: a.durationSeconds } : {}),
      ...(a.origin === "generated"
        ? { generationId: `scroll-generation-${picked.indexOf(a) + 1}` }
        : {}),
    };
    if (a.origin === "generated")
      generations.push({
        id: `scroll-generation-${picked.indexOf(a) + 1}`,
        inputAssetIds: [],
        referenceAssetIds: [],
        outputAssetIds: [a.id],
        prompt: a.prompt ?? "",
        tool: "Scrolls image generation",
      });
    if (playingAudio && audio)
      layers.push({
        id: "scroll-audio",
        name: a.name,
        kind: "audio",
        assetId: a.id,
        ...audio,
        gain: 1,
        locked: false,
        track: "scroll-audio",
      });
  }
  for (const c of timedCells(d)) {
    if (
      !c.assetId ||
      assets[c.assetId]?.use !== "production" ||
      assets[c.assetId]?.kind !== "image"
    )
      continue;
    layers.push({
      id: `scroll-shot-${d.cells.findIndex((cell) => cell.id === c.id) + 1}`,
      name: c.title,
      kind: "image",
      assetId: c.assetId,
      track: "scroll-panels",
      startFrame: c.startFrame,
      durationFrames: c.durationFrames,
      locked: false,
      fit: "contain",
      opacity: 1,
      position: { x: 0, y: 0 },
      scale: 1,
      rotationDegrees: 0,
    });
  }
  const project: Project = {
    schemaVersion: "director.bundle.v1",
    id: `scrolls-${d.id}`.slice(0, 64),
    name: d.name,
    revision: 1,
    composition: {
      fps: d.timing.fps,
      durationFrames,
      width: 1280,
      height: 720,
      colorSpace: "srgb",
      alpha: "straight",
      background: "#101316",
      bpm: d.timing.bpm,
      beatOffsetSeconds: d.timing.beatOffsetSeconds ?? 0,
    },
    assets,
    modules: {},
    layers,
    generationPlans: [],
    generations,
    notes: timedCells(d)
      .filter((c) =>
        layers.some(
          (l) =>
            l.id ===
            `scroll-shot-${d.cells.findIndex((cell) => cell.id === c.id) + 1}`,
        ),
      )
      .map((c) => ({
        id: `scroll-note-${d.cells.findIndex((cell) => cell.id === c.id) + 1}`,
        layerId: `scroll-shot-${d.cells.findIndex((cell) => cell.id === c.id) + 1}`,
        frame: c.startFrame,
        text: [
          c.prompt || c.title,
          c.camera && `Camera: ${c.camera}`,
          c.action && `Action: ${c.action}`,
        ]
          .filter(Boolean)
          .join(" · ")
          .replace(/\s+/g, " ")
          .slice(0, 500),
      })),
  };
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const a of picked)
    files.set(a.file.path, scroll.files.get(a.file.path)!);
  return { project, files };
}
async function openInDirectorImpl(scroll: ScrollBundle) {
  const selection = orderedSelection(scroll.document);
  if (!selection.length) throw new Error("Select results first.");
  const state = studioStore.getState(),
    before = state.director.bundle;
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for the current Director operation.");
  let next = await withEmptyStage(directorBundle(scroll));
  if (
    before?.project.id === next.project.id ||
    state.director.drafts[next.project.id]
  )
    throw new Error(
      "This scroll already has a Director draft. Open that draft to keep your edits; rename the scroll ID in a saved copy for a separate version.",
    );
  if (selection.filter((a) => a.kind === "image").length > 32)
    throw new Error("Choose up to 32 images for a Director handoff.");
  const refs = selection
    .filter((a) => a.kind === "image")
    .map((a, i) => ({
      id: a.id,
      label: `Inspiration ${i + 1}`,
      assetId: a.id,
    }));
  const roleText = selection.map((a) => `${a.role}: ${a.name}`).join("\n");
  const cellText = timedCells(scroll.document)
    .sort((a, b) => a.startFrame - b.startFrame)
    .map(
      (c, i) =>
        `${i + 1}. ${c.title} (${c.startFrame}–${c.startFrame + c.durationFrames} frames): ${c.prompt}\nCamera: ${c.camera || "unspecified"}\nAction: ${c.action || "unspecified"}\nMapped source: ${c.region ? `${c.region.assetId} [${c.region.box.join(", ")}]` : "none"}\nAccepted image: ${selection.some((a) => a.id === c.assetId) ? c.assetId : "none"}`,
    )
    .join("\n\n");
  const briefText = `${scroll.document.prompt}\n\nScrolls guidance:\n${roleText}\n${refs.map((r) => `[${r.label}]`).join(" ")}\n\nOrdered cells (camera/action are guidance):\n${cellText}`;
  if (briefText.length > 12000)
    throw new Error(
      "The Director brief would exceed 12,000 characters. Shorten the cell guidance or export the agent bundle.",
    );
  next = writeBrief(next, { version: 1, text: briefText, references: refs });
  await validateFiles(next);
  if (
    studioStore.getState().director.bundle !== before ||
    Object.values(studioStore.getState().operations).some(Boolean)
  )
    throw new Error("Director changed while preparing the import. Try again.");
  state.actions.commit(next, before);
  const current = studioStore.getState().director.bundle!;
  const handoff = scrollHandoff(scroll.document, "director");
  return {
    ...handoff,
    destinationProjectId: current.project.id,
    destinationRevision: current.project.revision,
    placements: handoff.assets.map((a) => ({
      sourceAssetId: a.id,
      destinationAssetId: a.id,
      role: a.role,
      layerIds: current.project.layers
        .filter((l) => "assetId" in l && l.assetId === a.id)
        .map((l) => l.id),
    })),
  };
}

export const openInDirector = (
  ...args: Parameters<typeof openInDirectorImpl>
) => withBrowserActivity("scrolls", () => openInDirectorImpl(...args));
