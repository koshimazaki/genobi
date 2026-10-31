import { useEffect, useState } from "react";
import type { useScrolls } from "./useScrolls";
import { MovementMenu } from "./MovementMenu";
import { editDraft, extractRegion } from "./regions";
import { useGenerationBridge } from "./bridge";
import { useShell } from "../studio/ShellContext";
import { readReference } from "../image-files";
import { assetType } from "./bundle";
import { download } from "../director/bundle";
import type { Box } from "../image-regions";
export function ScrollInspector({
  s,
  urls,
  mapping,
  setMapping,
}: {
  s: ReturnType<typeof useScrolls>;
  urls: Record<string, string>;
  mapping: boolean;
  setMapping: (value: boolean) => void;
}) {
  const d = s.bundle.document,
    c = d.cells.find((c) => c.id === s.selectedCell)!,
    bridge = useGenerationBridge(),
    shell = useShell();
  const region = c.region?.assetId === d.sheetAssetId ? c.region : undefined;
  const [bounds, setBounds] = useState<string[]>([]),
    [draft, setDraft] = useState<ReturnType<typeof editDraft>>();
  const regionKey = JSON.stringify(region?.box);
  useEffect(() => {
    setBounds(
      regionKey
        ? JSON.parse(regionKey).map(String)
        : ["0", "0", "1000", "1000"],
    );
    setDraft(undefined);
  }, [regionKey, c.id, d.sheetAssetId]);
  const createDraft = () => {
    try {
      setDraft(editDraft(d, c));
    } catch (e) {
      s.setMessage((e as Error).message);
    }
  };
  const openEdit = () =>
    void s.run(async () => {
      if (!draft || draft.revision !== s.bundle.document.revision)
        throw new Error("The sheet changed. Review a new edit draft.");
      if (!bridge) throw new Error("The image editor is still opening.");
      const before = s.bundle;
      const a = d.assets.find((a) => a.id === draft.source.id)!;
      const ref = await readReference(
        new File([s.bundle.files.get(a.file.path)!], a.name, {
          type: assetType(a),
        }),
      );
      if (!s.isCurrent(before))
        throw new Error("The sheet changed. Review a new edit draft.");
      bridge.update({
        generator: "edit",
        model: "flux-3",
        openOnly: false,
        description: draft.description,
        imageReferences: [ref],
        imageRegions: [draft.region],
        imageAspectRatio: "auto",
        cameraEnabled: false,
      });
      shell?.select("camera");
    });
  return (
    <aside className="scroll-inspector" aria-label="Selected cell">
      <header>
        <h2>
          {String(d.cells.indexOf(c) + 1).padStart(2, "0")} · {c.title}
        </h2>
        <button
          aria-label="Close cell inspector"
          onClick={() => s.setSelectedCell(null)}
        >
          ×
        </button>
      </header>
      {d.sheetAssetId && urls[d.sheetAssetId] && (
        <div className="scroll-inspector-sheet">
          <img src={urls[d.sheetAssetId]} alt="Whole source sheet" />
          {region && (
            <span
              style={{
                top: `${region.box[0] / 10}%`,
                left: `${region.box[1] / 10}%`,
                width: `${(region.box[3] - region.box[1]) / 10}%`,
                height: `${(region.box[2] - region.box[0]) / 10}%`,
              }}
            />
          )}
        </div>
      )}
      <label>
        Cell prompt
        <textarea
          id="scroll-cell-prompt"
          data-voice-scope={`${d.id}:${c.id}`}
          value={c.prompt}
          maxLength={1500}
          disabled={s.busy}
          placeholder="Describe this view or moment…"
          onChange={(e) => s.cell({ prompt: e.target.value })}
        />
      </label>
      <MovementMenu
        kind="camera"
        value={c.camera}
        disabled={s.busy}
        onChange={(camera) => s.cell({ camera })}
      />
      <MovementMenu
        kind="action"
        value={c.action}
        disabled={s.busy}
        onChange={(action) => s.cell({ action })}
      />
      <button
        disabled={s.busy || !d.sheetAssetId}
        aria-pressed={mapping}
        onClick={() => setMapping(!mapping)}
      >
        {mapping
          ? "Finish mapping"
          : region
            ? "Adjust region"
            : "Map region on sheet"}
      </button>
      <button disabled={s.busy || !region} onClick={createDraft}>
        Prepare region edit
      </button>
      {mapping && (
        <section className="scroll-region-fields">
          <p>
            Draw or resize the box on this sheet. Bounds describe the area you
            chose; no cells are detected automatically.
          </p>
          <div>
            {["Top", "Left", "Bottom", "Right"].map((label, i) => (
              <label key={label}>
                {label}
                <input
                  aria-label={`Region ${label.toLowerCase()}`}
                  type="number"
                  min={0}
                  max={1000}
                  value={bounds[i] ?? ""}
                  onChange={(e) =>
                    setBounds((v) =>
                      v.map((n, j) => (j === i ? e.target.value : n)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <button
            disabled={!d.sheetAssetId || s.busy}
            onClick={() =>
              s.cell({
                region: {
                  assetId: d.sheetAssetId!,
                  box: bounds.map(Number) as Box,
                },
              })
            }
          >
            Apply bounds
          </button>
        </section>
      )}
      {region && (
        <button
          disabled={s.busy}
          onClick={() =>
            void s.run(async () => {
              const before = s.bundle;
              const next = await extractRegion(before, c);
              s.commit(next, before);
              s.setMessage(
                "Reviewed region extracted and assigned to this cell. Select the derived frame below to send it to Director.",
              );
            })
          }
        >
          Use reviewed region as frame
        </button>
      )}
      {draft && (
        <section className="scroll-edit-draft">
          <strong>Edit draft</strong>
          <p>
            Open Klein cannot edit a source sheet here. FLUX 3 Edit uses an API;
            opening the editor submits nothing.
          </p>
          <pre>{draft.prompt}</pre>
          <button disabled={s.busy} onClick={openEdit}>
            Open FLUX 3 Edit
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(draft, null, 2)], {
                  type: "application/json",
                }),
                `${d.id}-${c.id}-edit.json`,
              )
            }
          >
            Save edit draft
          </button>
        </section>
      )}
      <details>
        <summary>Cell details</summary>
        <label>
          Title
          <input
            value={c.title}
            maxLength={80}
            onChange={(e) => s.cell({ title: e.target.value })}
          />
        </label>
        <p>Generate a new image of this moment without editing the sheet:</p>
        <button
          disabled={s.busy || !!s.pending}
          onClick={() => void s.quote({ kind: "cell", cellId: c.id })}
        >
          Quote separate cell
        </button>
      </details>
    </aside>
  );
}
