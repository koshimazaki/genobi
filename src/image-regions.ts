/** FLUX's documented grid: [top, left, bottom, right], 0–1000. */
export type Box = [number, number, number, number];
export type Handle = "move" | "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";
export interface ImageRegion {
  id: string;
  box: Box;
  action: "change" | "keep" | "move" | "remove";
  description: string;
  target?: Box;
  /** Index in the request's images array. Image 0 is the edit source. */
  referenceIndex?: number;
  /** Canvas-relative label position; presentation only, never sent. */
  label?: [number, number];
}
const clamp = (v: number, low = 0, high = 1000) =>
  Math.round(Math.min(high, Math.max(low, v)));
export function dragBox(
  start: [number, number],
  end: [number, number],
): Box | null {
  const [x1, y1] = start.map((v) => clamp(v)),
    [x2, y2] = end.map((v) => clamp(v));
  const box: Box = [
    Math.min(y1, y2),
    Math.min(x1, x2),
    Math.max(y1, y2),
    Math.max(x1, x2),
  ];
  return box[2] - box[0] >= 10 && box[3] - box[1] >= 10 ? box : null;
}
/** Moves preserve size at an edge; resizes cannot invert or leave the frame. */
export function transformBox(
  box: Box,
  handle: Handle,
  dx: number,
  dy: number,
): Box {
  const [t, l, b, r] = box;
  if (handle === "move") {
    const x = clamp(dx, -l, 1000 - r),
      y = clamp(dy, -t, 1000 - b);
    return [t + y, l + x, b + y, r + x];
  }
  return [
    handle.includes("n") ? clamp(t + dy, 0, b - 10) : t,
    handle.includes("w") ? clamp(l + dx, 0, r - 10) : l,
    handle.includes("s") ? clamp(b + dy, t + 10, 1000) : b,
    handle.includes("e") ? clamp(r + dx, l + 10, 1000) : r,
  ];
}
export function remapReferences(
  regions: ImageRegion[],
  order: number[],
): ImageRegion[] {
  return regions.map((region) => {
    if (region.referenceIndex === undefined) return region;
    const index = order.indexOf(region.referenceIndex);
    return { ...region, referenceIndex: index < 0 ? undefined : index };
  });
}
export function regionBlocker(
  regions: ImageRegion[],
  edit: boolean,
): string | null {
  const index = regions.findIndex(
    (r) =>
      !r.description.trim() &&
      (!edit || (r.action === "change" && r.referenceIndex === undefined)),
  );
  return index < 0
    ? null
    : `Describe box ${index + 1}${edit ? " or attach a reference image" : ""}.`;
}
export function imagePrompt(
  description: string,
  regions: ImageRegion[],
  edit: boolean,
): string {
  if (!regions.length) return description.trim();
  const rows = regions.map((r) =>
    edit
      ? {
          id: r.id,
          from:
            r.action !== "change"
              ? "ref_image_0"
              : r.referenceIndex !== undefined
                ? `ref_image_${r.referenceIndex}`
                : null,
          src_bbox:
            r.action !== "change"
              ? r.box
              : r.referenceIndex !== undefined
                ? [0, 0, 1000, 1000]
                : null,
          tgt_bbox:
            r.action === "remove"
              ? null
              : r.action === "move"
                ? (r.target ?? r.box)
                : r.box,
          desc: r.description.trim() || "the element in this area",
        }
      : { id: r.id, bbox: r.box, desc: r.description.trim() },
  );
  const clauses = regions.map((r) => {
    const box = r.action === "move" ? (r.target ?? r.box) : r.box;
    const x = (box[1] + box[3]) / 2,
      y = (box[0] + box[2]) / 2;
    const place =
      [
        y < 333 ? "top" : y > 667 ? "bottom" : "",
        x < 333 ? "left" : x > 667 ? "right" : "",
      ]
        .filter(Boolean)
        .join(" ") || "center";
    return `${edit ? r.action : "place"} <${r.id}> at the ${place}${edit && r.action === "change" && r.referenceIndex !== undefined ? ` from image ${r.referenceIndex + 1}` : ""}`;
  });
  return `${description.trim()}\n\n${edit ? "In <ref_image_0>, " : ""}${clauses.join("; ")}. ${edit ? "Keep the rest of the image unchanged. " : ""}${JSON.stringify(rows)}`;
}
