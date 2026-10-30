/**
 * `sceneHandoff`: one paragraph describing a scene for a prompt or another
 * agent (dimensions, materials, openings, props). Text only: no model call.
 */
import { CHARACTER_MODELS } from "./character-catalog";
import { isBoundary, primitiveBounds, union } from "./bounds";
import { interiorFaces, type Face } from "./faces";
import type { SceneSpec } from "./types";

const metres = (v: number) => `${Number(v.toFixed(2))} m`;

function dominant(face: Face) {
  let best: [string, number] = ["", 0];
  for (const entry of face.covered) if (entry[1] > best[1]) best = entry;
  return best[0];
}

export function sceneHandoff(spec: SceneSpec): string {
  const props = spec.objects.filter((p) => !isBoundary(p));
  const propText = props.length
    ? `${props.length} ${props.length === 1 ? "prop" : "props"}${
        props.some((p) => p.material)
          ? ` (${[...new Set(props.flatMap((p) => (p.material ? [p.material] : [])))].join(", ")})`
          : ""
      }`
    : "no props";
  const boundaries = spec.objects.filter(isBoundary);
  const faces =
    spec.objects.some((p) => p.role === "wall") &&
    interiorFaces(boundaries, union(boundaries.map(primitiveBounds))!);
  const cast = spec.characters?.length
    ? `Cast: ${spec.characters.map((c) => `${c.id} (${c.asset}, ${metres(CHARACTER_MODELS[c.asset].height * c.scale)}), ${c.pose}, at (${c.position.join(", ")})`).join("; ")}. `
    : "";
  const subject = `${cast}The subject stands at (${spec.subject.join(", ")}), scaled ${spec.scale}× around a 1.8 m figure, seen with a ${spec.fov}° lens.`;
  if (!faces) {
    const ground =
      spec.content.kind === "primitives"
        ? `an open set on ${metres(spec.content.ground)} of ground`
        : `the AKUSPACE ${spec.content.room.replace("_", " ")}`;
    return `${spec.label}: ${ground} with ${propText}. ${subject}`;
  }
  const [w, h, l] = faces.interior.max.map((v, i) => v - faces.interior.min[i]);
  const byName = (name: string) => faces.list.find((f) => f.name === name)!;
  const walls = faces.list.filter((f) => f.name.endsWith("wall"));
  const wallMaterials = [...new Set(walls.map(dominant).filter(Boolean))];
  const surface = (name: string) => {
    const f = byName(name);
    return f.covered.size ? `a ${dominant(f)} ${name}` : `no ${name}`;
  };
  const openings = walls
    .filter((f) => f.covered.size && f.openingM2 > 0.01)
    .map((f) => `${f.openingM2.toFixed(1)} m² in the ${f.name}`);
  const openText = openings.length ? ` Openings: ${openings.join(", ")}.` : "";
  return `${spec.label}: a ${metres(w)} × ${metres(l)} room, ${metres(h)} high, with ${wallMaterials.join(" and ") || "open"} walls, ${surface("floor")} and ${surface("ceiling")}, and ${propText}.${openText} ${subject}`;
}
