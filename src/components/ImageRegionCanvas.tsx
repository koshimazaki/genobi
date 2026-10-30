import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  dragBox,
  transformBox,
  type Box,
  type Handle,
  type ImageRegion,
} from "../image-regions";
import { REFERENCE_DRAG, type ImageReferences } from "../useImageReferences";

type Gesture = {
  id?: string;
  part: "box" | "target" | "label" | "draw";
  handle: Handle;
  start: [number, number];
  origin?: ImageRegion;
};
const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const colors = ["var(--accent)", "#8dbce8", "#e5a883", "#bc9de8", "#80c6af"];
const style = (box: Box): CSSProperties => ({
  top: `${box[0] / 10}%`,
  left: `${box[1] / 10}%`,
  height: `${(box[2] - box[0]) / 10}%`,
  width: `${(box[3] - box[1]) / 10}%`,
});
export default function ImageRegionCanvas({
  source,
  ratio,
  regions,
  activeId,
  refs,
  images,
  onSelect,
  onAdd,
  onChange,
  onRemove,
}: {
  source?: string;
  ratio: string;
  regions: ImageRegion[];
  activeId: string | null;
  refs: string[];
  images: ImageReferences;
  onSelect: (id: string | null) => void;
  onAdd: (box: Box) => void;
  onChange: (region: ImageRegion) => void;
  onRemove: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 }),
    [natural, setNatural] = useState(1),
    [draft, setDraft] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [rw, rh] = ratio.split(":").map(Number);
  const aspect = source ? natural : rw > 0 && rh > 0 ? rw / rh : 1;
  const width = Math.min(size.width, size.height * aspect),
    height = width / aspect;
  function point(e: PointerEvent): [number, number] {
    const rect = canvas.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * 1000,
      ((e.clientY - rect.top) / rect.height) * 1000,
    ];
  }
  function start(
    e: PointerEvent,
    part: Gesture["part"],
    region?: ImageRegion,
    handle: Handle = "move",
  ) {
    if (e.button !== 0 || images.loading) return;
    if (e.shiftKey && region) return;
    if (part === "draw" && regions.length >= 12) return;
    e.preventDefault();
    e.stopPropagation();
    canvas.current!.focus();
    gesture.current = {
      id: region?.id,
      part,
      handle,
      start: point(e),
      origin: region,
    };
    canvas.current!.setPointerCapture(e.pointerId);
    onSelect(region?.id ?? null);
  }
  function result(e: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e),
      dx = p[0] - g.start[0],
      dy = p[1] - g.start[1];
    if (g.part === "draw") {
      setDraft(dragBox(g.start, p));
      return;
    }
    const r = g.origin!;
    if (g.part === "label") {
      const base = r.label ?? [r.box[1], r.box[0]];
      onChange({
        ...r,
        label: [
          Math.max(0, Math.min(1000 - (100 / width) * 1000, base[0] + dx)),
          Math.max(0, Math.min(1000 - (28 / height) * 1000, base[1] + dy)),
        ],
      });
    } else
      onChange({
        ...r,
        [g.part]: transformBox(
          g.part === "target" ? (r.target ?? r.box) : r.box,
          g.handle,
          dx,
          dy,
        ),
      });
  }
  function end(e: PointerEvent, cancel = false) {
    const g = gesture.current;
    if (!g) return;
    if (cancel) {
      if (g.origin) onChange(g.origin);
    } else if (g.part === "draw") {
      const box = dragBox(g.start, point(e));
      if (box) onAdd(box);
    } else result(e);
    gesture.current = null;
    setDraft(null);
    if (canvas.current!.hasPointerCapture(e.pointerId))
      canvas.current!.releasePointerCapture(e.pointerId);
  }
  return (
    <div className="image-canvas-host" ref={host}>
      <div
        ref={canvas}
        className="image-region-canvas"
        style={{ width, height }}
        tabIndex={0}
        role="group"
        aria-label="Image region canvas. Drag to draw; Shift-drag over a box draws another."
        onPointerDown={(e) => start(e, "draw")}
        onPointerMove={result}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onKeyDown={(e) => {
          const region = regions.find((r) => r.id === activeId);
          if (e.key === "Escape") {
            onSelect(null);
            return;
          }
          if (!region || e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onRemove(region.id);
            return;
          }
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          if (delta[e.key]) {
            e.preventDefault();
            const [x, y] = delta[e.key],
              step = e.shiftKey ? 50 : 10;
            onChange({
              ...region,
              box: transformBox(region.box, "move", x * step, y * step),
            });
          }
        }}
      >
        {source ? (
          <img
            src={source}
            alt="Source image — editing canvas"
            draggable={false}
            onLoad={(e) =>
              setNatural(
                e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
              )
            }
          />
        ) : (
          <span className="image-canvas-hint">Draw your composition</span>
        )}
        {regions.map((region, index) => {
          const selected = region.id === activeId;
          const thumb =
            region.referenceIndex === undefined
              ? source
              : refs[region.referenceIndex];
          const label = region.label ?? [region.box[1], region.box[0]];
          const area =
            (region.box[2] - region.box[0]) * (region.box[3] - region.box[1]);
          const layer = selected
            ? 30
            : 2 +
              regions.filter(
                (r) => (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]) > area,
              ).length;
          const frames: ("box" | "target")[] =
            region.action === "move" && region.target
              ? ["box", "target"]
              : ["box"];
          return (
            <div
              key={region.id}
              style={
                {
                  "--region-color": colors[index % colors.length],
                } as CSSProperties
              }
            >
              {frames.map((part) => (
                <div
                  key={part}
                  className={`image-region-outline ${selected ? "is-active" : ""} ${part === "target" ? "is-target" : ""}`}
                  style={{
                    ...style(part === "target" ? region.target! : region.box),
                    zIndex: layer,
                  }}
                  aria-label={`Box ${index + 1}${part === "target" ? " move target" : ""}`}
                  onPointerDown={(e) => start(e, part, region)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(region.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const value = e.dataTransfer.getData(REFERENCE_DRAG);
                    if (value !== "") images.assign(region.id, Number(value));
                    else
                      void images.add(
                        Array.from(e.dataTransfer.files),
                        region.id,
                      );
                  }}
                >
                  {part === "target" && (
                    <span className="region-target-label">{index + 1} →</span>
                  )}
                  {selected &&
                    handles.map((handle) => (
                      <span
                        key={handle}
                        className={`region-handle handle-${handle}`}
                        onPointerDown={(e) => start(e, part, region, handle)}
                      />
                    ))}
                </div>
              ))}
              <div
                className="region-chip"
                style={{
                  left: `clamp(0px, ${label[0] / 10}%, max(0px, 100% - 100px))`,
                  top: `clamp(0px, ${label[1] / 10}%, max(0px, 100% - 28px))`,
                  zIndex: layer + 1,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(region.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const value = e.dataTransfer.getData(REFERENCE_DRAG);
                  if (value !== "") images.assign(region.id, Number(value));
                  else
                    void images.add(
                      Array.from(e.dataTransfer.files),
                      region.id,
                    );
                }}
              >
                <button
                  className="region-label-grip"
                  aria-label={`Move label for box ${index + 1}`}
                  title="Drag label independently; double-click to reset"
                  onPointerDown={(e) => start(e, "label", region)}
                  onDoubleClick={() =>
                    onChange({ ...region, label: undefined })
                  }
                >
                  ⠿
                </button>
                <button
                  className="region-chip-open"
                  aria-label={`Edit box ${index + 1}`}
                  onClick={() => onSelect(region.id)}
                >
                  {thumb && <img src={thumb} alt="" draggable={false} />}
                  <span>
                    {index + 1} · {region.action}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
        {draft && (
          <div className="image-region-outline is-draft" style={style(draft)} />
        )}
      </div>
    </div>
  );
}
