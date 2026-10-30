import ThemedSelect from "../components/ThemedSelect";
import { missingTrack } from "../../shared/director/track-slot";
import { useEffect, useRef, useState } from "react";
import { useStudio } from "../studio/useStudio";
import { studioStore } from "../studio/store";
import { executeStudioCommand } from "../studio/commands";
import { assetUses } from "../../shared/director/assets";
import { findTemplate } from "./template-catalogue";
import { saveBundle } from "./bundle";
import MediaTile from "./MediaTile";
import { stopPlayback } from "./media-playback";
import AssetClips from "./AssetClips";
import { linkedClip, rangeLabel, sourceRange } from "./clip-source";
import { activeReferences, readBrief } from "./prompt-brief";
import "./asset-drawer.css";
import { MediaDropZone } from "./MediaDropZone";
import { writeAssetDrag } from "./asset-drag";

export default function ProjectAssetDrawer({
  disabled,
  report,
  launcher = true,
}: {
  launcher?: boolean;
  disabled: boolean;
  report: (e: unknown) => void;
}) {
  const bundle = useStudio((s) => s.director.bundle);
  const workspace = useStudio((s) => s.workspace);
  const actions = useStudio((s) => s.actions);
  const history = useStudio((s) => s.director.history);
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  const [limit, setLimit] = useState(12);
  const {
    drawerOpen,
    assetRole,
    assetSelection,
    targetLayers,
    selected: layerId,
  } = workspace;
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (drawerOpen && !el.open) el.showModal();
    if (!drawerOpen && el.open) el.close();
    if (!drawerOpen) stopPlayback();
  }, [drawerOpen]);
  if (!bundle) return null;
  const p = bundle.project;
  const all = Object.entries(p.assets),
    entries = all.filter(([, a]) => a.use === assetRole);
  const selected = p.assets[assetSelection];
  // "Show in media" can select an asset past the first page; keep it in view.
  const shown = Math.max(
    limit,
    Math.ceil((entries.findIndex(([id]) => id === assetSelection) + 1) / 12) *
      12,
  );
  const uses = selected
    ? [
        ...assetUses(p, assetSelection),
        ...activeReferences(readBrief(bundle))
          .filter((r) => r.assetId === assetSelection)
          .map((r) => `Prompt: ${r.label}`),
      ]
    : [];
  const missing = missingTrack(p);
  const slots: { label: string; ids: string[] }[] = [
    ...(findTemplate(p.id)?.slots ?? [])
      .filter((s) =>
        s.layerIds.every((id) => p.layers.some((l) => l.id === id)),
      )
      .map((s) => ({ label: s.label, ids: [...s.layerIds] })),
    ...p.layers
      .filter((l) => "assetId" in l)
      .map((l) => ({ label: `Layer: ${l.name}`, ids: [l.id] })),
    // The template's track before it has a lane: the use adds the lane.
    ...(missing
      ? [{ label: `Add track: ${missing.name}`, ids: [missing.id] }]
      : []),
  ];
  const target = slots.find(
    (s) => JSON.stringify(s.ids) === JSON.stringify(targetLayers),
  );
  const validTarget =
    selected &&
    target &&
    target.ids.every((id) => {
      const l = p.layers.find((l) => l.id === id);
      if (!l && id === missing?.id) return selected.kind === "audio";
      return (
        l && !l.locked && (l.kind === "audio") === (selected.kind === "audio")
      );
    });
  const name = (id: string) =>
    p.layers.find((l) => "assetId" in l && l.assetId === id)?.name ??
    p.assets[id].file.path.split("/").at(-1)!;
  async function command(
    op: string,
    fields: Record<string, unknown> = {},
    file?: File,
  ) {
    setNotice("");
    try {
      const current = studioStore.getState().director.bundle!;
      const result = await executeStudioCommand(
        { op, revision: current.project.revision, ...fields },
        file,
      );
      const receipt = result.receipt;
      if (receipt && "assetIds" in receipt && Array.isArray(receipt.assetIds))
        actions.workspace({ assetSelection: receipt.assetIds[0] ?? "" });
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      report(e);
      return false;
    }
  }
  async function add(files: File[]) {
    if (!files.length) return;
    const initialProject = studioStore.getState().director.bundle?.project.id;
    // One explicit import at a time; the command guard also excludes other writers.
    for (const file of files) {
      if (studioStore.getState().director.bundle?.project.id !== initialProject)
        return;
      if (!(await command("import-asset", { use: assetRole }, file))) return;
    }
    setNotice(
      assetRole === "reference"
        ? "Inspiration added. It stays outside the video."
        : "Added to project. Choose where to use it.",
    );
  }
  return (
    <section
      className={launcher ? "dir-assets" : "dir-assets dir-assets-global"}
    >
      {launcher && (
        <div className="dir-assets-launch">
          <button
            disabled={disabled}
            onClick={() => actions.workspace({ drawerOpen: true })}
          >
            Project media · {all.length}
          </button>
          <span>Assets & inspirations · stored in this tab</span>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="project-media-title"
        onClose={() => actions.workspace({ drawerOpen: false })}
        onCancel={() => actions.workspace({ drawerOpen: false })}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) void add(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="dir-assets-heading">
          <h2 id="project-media-title">Project media</h2>
          <button
            onClick={() => actions.workspace({ drawerOpen: false })}
            autoFocus
          >
            Close
          </button>
        </div>
        <div className="dir-assets-tabs" role="group" aria-label="Media role">
          <button
            aria-pressed={assetRole === "production"}
            onClick={() => {
              actions.workspace({
                assetRole: "production",
                assetSelection: "",
              });
              setLimit(12);
            }}
          >
            Assets · {all.filter(([, a]) => a.use === "production").length}
          </button>
          <button
            aria-pressed={assetRole === "reference"}
            onClick={() => {
              actions.workspace({ assetRole: "reference", assetSelection: "" });
              setLimit(12);
            }}
          >
            Inspirations · {all.filter(([, a]) => a.use === "reference").length}
          </button>
        </div>
        <p>
          {assetRole === "reference"
            ? "Style guidance kept with the project. Not included in the rendered video."
            : "Choose existing media, or add a file. Importing does not change your video."}
        </p>
        <MediaDropZone
          multiple
          disabled={disabled}
          label={
            assetRole === "reference"
              ? "Drop inspirations here"
              : "Drop assets here"
          }
          hint={
            assetRole === "reference"
              ? "Images and videos for style guidance"
              : "Images, video or audio · import first, place when ready"
          }
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/*"
          onFiles={add}
        />
        {notice && <p role="status">{notice}</p>}
        {!entries.length && (
          <p className="dir-assets-empty">
            No {assetRole === "reference" ? "inspirations" : "assets"} yet. Drop
            files above, or choose them from your device.
          </p>
        )}
        <div className="dir-assets-grid">
          {drawerOpen &&
            entries.slice(0, shown).map(([id, a]) => {
              const clip = linkedClip(p, id, layerId);
              const range = clip && sourceRange(clip, a, p.composition.fps);
              const label = name(id);
              return (
                <MediaTile
                  key={id}
                  asset={a}
                  bytes={bundle.files.get(a.file.path)}
                  seconds={range?.inSeconds}
                  name={label}
                  doubleClick
                >
                  {(frame) => (
                    <button
                      className="dir-asset-card"
                      draggable={!disabled}
                      onDragStart={(event) => {
                        if (disabled) event.preventDefault();
                        else writeAssetDrag(event.dataTransfer, bundle, id);
                      }}
                      aria-pressed={id === assetSelection}
                      onClick={() => actions.workspace({ assetSelection: id })}
                      title={label}
                    >
                      {frame}
                      <strong>{label}</strong>
                      <small>
                        {a.kind} ·{" "}
                        {range
                          ? rangeLabel(range)
                          : assetUses(p, id).length
                            ? "In use"
                            : "Not placed"}
                      </small>
                    </button>
                  )}
                </MediaTile>
              );
            })}
        </div>
        {entries.length > shown && (
          <button onClick={() => setLimit(shown + 12)}>Show more</button>
        )}
        {selected && selected.use === assetRole && (
          <div className="dir-asset-actions">
            <strong>{name(assetSelection)}</strong>
            {uses.length > 0 && <p>Used by: {uses.join(", ")}</p>}
            <AssetClips project={p} assetId={assetSelection} />
            <label>
              Use in
              <ThemedSelect
                value={target ? JSON.stringify(target.ids) : ""}
                onChange={(e) =>
                  actions.workspace({
                    targetLayers: e.target.value
                      ? JSON.parse(e.target.value)
                      : [],
                  })
                }
              >
                <option value="">Choose a slot or layer</option>
                {slots.map((s) => (
                  <option key={s.label} value={JSON.stringify(s.ids)}>
                    {s.label}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <button
              className="dir-primary"
              disabled={disabled || !validTarget}
              onClick={async () => {
                if (
                  await command("use-asset", {
                    assetId: assetSelection,
                    layerIds: targetLayers,
                  })
                ) {
                  setNotice(`Placed in ${target?.label}.`);
                  actions.workspace({ drawerOpen: false });
                }
              }}
            >
              {assetRole === "reference"
                ? "Use a copy as content"
                : "Use selected media"}
            </button>
            <button
              disabled={disabled}
              onClick={async () => {
                const use =
                  assetRole === "production" ? "reference" : "production";
                if (
                  await command("alias-asset", { assetId: assetSelection, use })
                )
                  actions.workspace({ assetRole: use });
              }}
            >
              {assetRole === "production"
                ? "Keep as inspiration too"
                : "Copy to Assets"}
            </button>
            <button
              disabled={disabled || uses.length > 0}
              onClick={async () => {
                if (await command("remove-asset", { assetId: assetSelection }))
                  actions.workspace({ assetSelection: "" });
              }}
            >
              Remove unused asset
            </button>
          </div>
        )}
        <footer className="dir-assets-footer">
          <button
            disabled={disabled || !history.length}
            onClick={() => actions.undo()}
          >
            Undo
          </button>
          <button disabled={disabled} onClick={() => saveBundle(bundle)}>
            Save editable project
          </button>
          <small>
            Includes assets and inspirations. Save before closing or reloading.
          </small>
        </footer>
      </dialog>
    </section>
  );
}
