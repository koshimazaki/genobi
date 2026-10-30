import type { CameraTerm } from "../../shared/camera";
export function angleGlyphPosition(elevation = 0) {
  const angle = (elevation * Math.PI) / 180;
  return {
    x: 27 - Math.cos(angle) * 19,
    y: 18 - Math.sin(angle) * 14,
    rotation: elevation,
  };
}
export function framingGlyph(term: CameraTerm) {
  if (term.id === "macro") return { scale: 5, y: 42 };
  if (term.id === "extreme-close-up") return { scale: 2.7, y: 28 };
  if (term.id === "close-up") return { scale: 1.9, y: 23 };
  return { scale: Math.min(1.5, 2.7 / (term.pose.distance ?? 2.7)), y: 18 };
}
