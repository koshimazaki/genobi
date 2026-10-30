import { useRef, useState, type PointerEvent } from "react";
import { dragBox, transformBox, type Box, type Handle } from "../image-regions";
import type { ScrollDocument } from "../../shared/scrolls/types";
const position = (b: Box) => ({
  top: `${b[0] / 10}%`,
  left: `${b[1] / 10}%`,
  width: `${(b[3] - b[1]) / 10}%`,
  height: `${(b[2] - b[0]) / 10}%`,
});
type Drag = {
  id: string;
  revision: number;
  start: [number, number];
  box?: Box;
  handle: Handle | "draw";
};
export function RegionCanvas({
  document: d,
  url,
  selectedId,
  mapping,
  disabled,
  onSelect,
  onRegion,
}: {
  document: ScrollDocument;
  url: string;
  selectedId: string | null;
  mapping: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRegion: (id: string, box: Box, revision: number) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | undefined>(undefined);
  const [ghost, setGhost] = useState<{ id: string; box: Box }>();
  const ghostRef = useRef<{ id: string; box: Box } | undefined>(undefined);
  function updateGhost(value: { id: string; box: Box } | undefined) {
    ghostRef.current = value;
    setGhost(value);
  }
  const point = (e: PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * 1000,
      ((e.clientY - r.top) / r.height) * 1000,
    ];
  };
  const begin = (
    e: PointerEvent,
    id: string,
    handle: Drag["handle"],
    box?: Box,
  ) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    updateGhost(undefined);
    drag.current = { id, revision: d.revision, start: point(e), handle, box };
    canvas.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const p = point(e),
      box =
        g.handle === "draw"
          ? dragBox(g.start, p)
          : transformBox(
              g.box!,
              g.handle,
              p[0] - g.start[0],
              p[1] - g.start[1],
            );
    updateGhost(box ? { id: g.id, box } : undefined);
  };
  const end = () => {
    const g = drag.current;
    if (g && ghostRef.current) onRegion(g.id, ghostRef.current.box, g.revision);
    drag.current = undefined;
    updateGhost(undefined);
  };
  return (
    <div
      ref={canvas}
      className={`scroll-sheet-canvas ${mapping ? "is-mapping" : ""}`}
      onPointerDown={(e) => {
        if (mapping && selectedId) begin(e, selectedId, "draw");
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        drag.current = undefined;
        updateGhost(undefined);
      }}
    >
      <img
        className="scroll-sheet-image"
        src={url}
        alt="Whole sheet; regions are manually mapped guidance"
        draggable={false}
      />
      {d.cells.map((c, i) => {
        const box =
          ghost?.id === c.id
            ? ghost.box
            : c.region && c.region.assetId === d.sheetAssetId
              ? c.region.box
              : undefined;
        if (!box) return null;
        return (
          <div
            key={c.id}
            className="scroll-region-box"
            data-selected={selectedId === c.id}
            style={position(box)}
          >
            <button
              aria-label={`Select region ${i + 1}: ${c.title}`}
              className="scroll-region-hit"
              onClick={() => onSelect(c.id)}
              onPointerDown={(e) => begin(e, c.id, "move", box)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
            </button>
            {selectedId === c.id &&
              (["nw", "ne", "se", "sw"] as const).map((handle) => (
                <button
                  key={handle}
                  className={`scroll-region-handle ${handle}`}
                  aria-label={`Resize region ${handle}`}
                  onPointerDown={(e) => begin(e, c.id, handle, box)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
