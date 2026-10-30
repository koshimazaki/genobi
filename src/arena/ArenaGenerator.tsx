import {
  arenaMediaUrl,
  type Arena,
  type ArenaDraft,
  type ArenaSlot,
} from "../../shared/arena";
import {
  ARENA_ASPECTS,
  ARENA_RESOLUTIONS,
  draftSettings,
  takesReferences,
  type ArenaSettings,
} from "../../shared/arena-run";
import { LTX_DURATIONS } from "../../shared/comfy/ltx";
import { IMAGE_ASPECT_RATIOS, KLEIN_RESOLUTIONS } from "../../shared/image";
import { readyEntry } from "../../shared/registry";
import type { Job } from "../../shared/types";
import AspectRatioIcon from "../components/AspectRatioIcon";
import Icon from "../components/Icon";
import SelectMenu from "../components/SelectMenu";
import { acceptsStudioMedia } from "../studio/media-drop";
import { writeArenaDrag } from "./arena-drag";
import ArenaModelMenu from "./ArenaModelMenu";
import { fittedSummary, generateAllLoads, slotEstimate } from "./quote-runs";
import { referenceImages, referenceProblem } from "./run-references";
import { runnable } from "./run-state";
import "./arena-generator.css";

const tier = (value: string) =>
  value === "fhd" ? "Full HD" : value.toUpperCase();
const money = (usd: number | null) =>
  usd === null ? "—" : `$${usd.toFixed(2)}`;

/**
 * Arena's generator: one main prompt, shared references and settings, and a
 * model per load. Generate goes through the studio's paid path (a quote per
 * load, one confirmation, the key saved before submission), so each load is
 * quoted exactly as the Camera would quote that model with those settings.
 */
export default function ArenaGenerator({
  arena,
  draft,
  busy,
  jobs,
  onEdit,
  onPatch,
  onGenerate,
  onDropReference,
  onAddReference,
}: {
  arena: Arena;
  draft: ArenaDraft;
  busy: boolean;
  jobs: Record<string, Job>;
  onEdit: (draft: ArenaDraft) => void;
  onPatch: (slotId: string, change: Partial<ArenaSlot>) => void;
  onGenerate: (slotIds: string[]) => void;
  onDropReference: (transfer: DataTransfer) => void;
  onAddReference: () => void;
}) {
  const settings = draftSettings(draft);
  const set = (change: ArenaSettings) =>
    onEdit({ ...draft, settings: { ...settings, ...change } });
  const kinds = new Set(
    draft.slots.map((s) => s.run && readyEntry(s.run.entry)?.generator),
  );
  const references = arena.media.filter(
    (m) => !draft.slots.some((s) => s.media === m.hash),
  );
  const stills = referenceImages(arena).length;
  const takers = draft.slots.filter(
    (s) => s.run && takesReferences(s.run.entry),
  );
  const problem = takers.length ? referenceProblem(arena) : undefined;
  // Generate all fills empty loads; a row's Generate is the deliberate re-run.
  const ready = generateAllLoads(draft, jobs);
  const total = ready.reduce((n, s) => n + (slotEstimate(draft, s) ?? 0), 0);
  return (
    <section className="arena-generator composer" aria-label="Arena generator">
      <label className="arena-generator-prompt">
        <span>Main prompt</span>
        <textarea
          value={draft.prompt}
          maxLength={8000}
          disabled={busy}
          placeholder="Describe the scene every load should make. A load's own prompt, under its settings, replaces this for that load."
          onChange={(e) => onEdit({ ...draft, prompt: e.target.value })}
        />
      </label>
      <div
        className="arena-reference-drop"
        role="group"
        aria-label="References"
        onDragOver={(e) => {
          if (acceptsStudioMedia(e.dataTransfer.types)) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!acceptsStudioMedia(e.dataTransfer.types)) return;
          e.preventDefault();
          if (!busy) onDropReference(e.dataTransfer);
        }}
      >
        {references.map((media) => (
          <a
            key={media.hash}
            href={arenaMediaUrl(arena.id, media.hash)}
            target="_blank"
            rel="noreferrer"
            title={media.label}
            onDragStart={(e) => writeArenaDrag(e.dataTransfer, arena.id, media)}
          >
            {media.kind === "image" ? (
              <img
                src={arenaMediaUrl(arena.id, media.hash)}
                alt={media.label}
              />
            ) : (
              <Icon name="film" size={18} />
            )}
          </a>
        ))}
        <button type="button" disabled={busy} onClick={onAddReference}>
          <Icon name="plus" size={14} /> Reference
        </button>
        <small>
          Drop images or project assets here.{" "}
          {takers.length
            ? `${stills} still${stills === 1 ? "" : "s"} go to ${takers.map((s) => s.label).join(", ")}.`
            : "Only image models take references; video loads run from the prompt."}
        </small>
        {problem && (
          <p className="arena-generator-problem" role="alert">
            {problem}
          </p>
        )}
      </div>
      <div
        className="arena-generator-settings"
        role="group"
        aria-label="Shared settings"
      >
        {(kinds.has("video") || !kinds.has("image")) && (
          <>
            <SelectMenu
              id="arena-gen-duration"
              label="Duration"
              compact
              portal
              disabled={busy}
              value={String(settings.duration)}
              options={[...new Set([...LTX_DURATIONS, settings.duration ?? 5])]
                .sort((a, b) => a - b)
                .map((d) => ({ value: String(d), label: `${d}s` }))}
              onChange={(v) => set({ duration: Number(v) })}
            />
            <SelectMenu
              id="arena-gen-aspect"
              label="Aspect ratio"
              compact
              portal
              disabled={busy}
              value={settings.aspectRatio ?? "16:9"}
              options={ARENA_ASPECTS.map((value) => ({
                value,
                label: value,
                icon: <AspectRatioIcon ratio={value} />,
              }))}
              onChange={(v) =>
                set({ aspectRatio: v as ArenaSettings["aspectRatio"] })
              }
            />
            <SelectMenu
              id="arena-gen-resolution"
              label="Resolution"
              compact
              portal
              disabled={busy}
              value={settings.resolution ?? "hd"}
              options={ARENA_RESOLUTIONS.map((value) => ({
                value,
                label: tier(value),
              }))}
              onChange={(v) =>
                set({ resolution: v as ArenaSettings["resolution"] })
              }
            />
          </>
        )}
        {kinds.has("image") && (
          <>
            <SelectMenu
              id="arena-gen-image-size"
              label="Image size"
              compact
              portal
              disabled={busy}
              value={settings.imageResolution ?? "1k"}
              options={KLEIN_RESOLUTIONS.map((value) => ({
                value,
                label: value.toUpperCase(),
              }))}
              onChange={(v) =>
                set({ imageResolution: v as ArenaSettings["imageResolution"] })
              }
            />
            <SelectMenu
              id="arena-gen-image-ratio"
              label="Image ratio"
              compact
              portal
              disabled={busy}
              value={settings.imageAspectRatio ?? "auto"}
              options={IMAGE_ASPECT_RATIOS.map((value) => ({
                value,
                label: value === "auto" ? "Auto" : value,
              }))}
              onChange={(v) =>
                set({
                  imageAspectRatio: v as ArenaSettings["imageAspectRatio"],
                })
              }
            />
          </>
        )}
      </div>
      <ol className="arena-loads">
        {draft.slots.map((slot, index) => {
          const estimate = slotEstimate(draft, slot);
          const own = !!slot.prompt.trim();
          return (
            <li key={slot.id}>
              <span className="arena-load-name">
                Load {index + 1}
                <strong>{slot.label}</strong>
              </span>
              <ArenaModelMenu
                id={`arena-gen-model-${slot.id}`}
                slot={slot}
                disabled={busy}
                onChange={(change) => onPatch(slot.id, change)}
              />
              <span className="arena-load-facts">
                <span>{fittedSummary(draft, slot) || "Record only"}</span>
                <span>{own ? "Own prompt" : "Main prompt"}</span>
              </span>
              <span
                className="arena-load-cost"
                title="Estimate; Generate quotes each load first"
              >
                {money(estimate)}
              </span>
              <button
                type="button"
                disabled={busy || estimate === null || !runnable(slot, jobs)}
                onClick={() => onGenerate([slot.id])}
                aria-label={`Generate ${slot.label}`}
              >
                Generate
              </button>
            </li>
          );
        })}
      </ol>
      <div className="arena-generator-footer">
        <span>
          {ready.length
            ? `${ready.length} load${ready.length > 1 ? "s" : ""} · est. ${money(total)}. Each is quoted, then you confirm once.`
            : draft.slots.some((s) => s.media && runnable(s, jobs))
              ? "Every load with a model has a result. A row's Generate runs it again."
              : "Choose a model for a load and write a prompt to generate."}
        </span>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !ready.length}
          onClick={() => onGenerate(ready.map((s) => s.id))}
        >
          Generate {ready.length > 1 ? "all" : ""}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </section>
  );
}
