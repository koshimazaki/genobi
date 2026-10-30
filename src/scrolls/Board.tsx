import { useState } from "react";
import type { useScrolls } from "./useScrolls";
import { RegionCanvas } from "./RegionCanvas";
import { ScrollInspector } from "./Inspector";
import { MovementMenu } from "./MovementMenu";
export function ScrollBoard({
  s,
  urls,
}: {
  s: ReturnType<typeof useScrolls>;
  urls: Record<string, string>;
}) {
  const d = s.bundle.document,
    selected = d.cells.find((c) => c.id === s.selectedCell);
  const [mapping, setMapping] = useState(false);
  const url = d.sheetAssetId ? urls[d.sheetAssetId] : undefined;
  return (
    <div className="scroll-workbench" data-inspector={!!selected}>
      <div className="scroll-paper" data-kind={d.kind}>
        <div className="scroll-paper-heading">
          <input
            aria-label="Scroll title"
            value={d.name}
            maxLength={120}
            disabled={s.busy}
            onChange={(e) => s.edit({ op: "brief", name: e.target.value })}
          />
          <span>
            {d.kind === "character" ? "CHARACTER STUDY" : "STORYBOARD"} /{" "}
            {d.cells.length} CELLS
          </span>
        </div>
        {url ? (
          <div className="scroll-sheet-with-remove">
            <button
              className="scroll-sheet-remove"
              aria-label="Remove displayed sheet"
              disabled={s.busy}
              onClick={() => s.removeAsset(d.sheetAssetId!)}
            >
              ×
            </button>
            <RegionCanvas
              document={d}
              url={url}
              selectedId={s.selectedCell}
              mapping={mapping}
              disabled={s.busy}
              onSelect={s.setSelectedCell}
              onRegion={(id, box, revision) => {
                const c = d.cells.find((c) => c.id === id)!;
                s.edit({
                  op: "cell",
                  revision,
                  cell: { ...c, region: { assetId: d.sheetAssetId!, box } },
                });
              }}
            />
          </div>
        ) : (
          <div className="scroll-sheet-empty">
            <strong>Your next scroll starts here.</strong>
            <p>
              Write one brief below, generate a whole sheet, or import an image.
            </p>
            <span>
              Cells are planned views and moments. Map regions on the resulting
              sheet when you need finer control.
            </span>
          </div>
        )}
        <div className="scroll-cell-nav" aria-label="Planned cells">
          {d.cells.map((c, i) => (
            <button
              key={c.id}
              aria-pressed={c.id === s.selectedCell}
              onClick={() => {
                s.setSelectedCell(c.id);
                setMapping(false);
              }}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>{c.title}</span>
              {c.region && c.region.assetId === d.sheetAssetId && (
                <small>Mapped</small>
              )}
            </button>
          ))}
        </div>
        {d.kind === "storyboard" && (
          <div className="scroll-movement-strips">
            {(["camera", "action"] as const).map((kind) => (
              <div className="scroll-movement" key={kind}>
                <strong>{kind.toUpperCase()}</strong>
                <div>
                  {d.cells.map((c, i) => (
                    <MovementMenu
                      key={c.id}
                      kind={kind}
                      value={c[kind]}
                      number={String(i + 1).padStart(2, "0")}
                      label={`Edit ${kind} for cell ${i + 1}`}
                      disabled={s.busy}
                      onChange={(value) =>
                        s.edit({ op: "cell", cell: { ...c, [kind]: value } })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <footer className="scroll-paper-foot">
          GENOBI / SCROLLS{" "}
          <span>
            Whole sheet ·{" "}
            {url ? "regions are mapped manually" : "no generated image yet"}
          </span>
        </footer>
      </div>
      {selected && (
        <ScrollInspector
          key={selected.id}
          s={s}
          urls={urls}
          mapping={mapping}
          setMapping={setMapping}
        />
      )}
    </div>
  );
}
