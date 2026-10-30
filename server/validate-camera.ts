import {
  cameraSections,
  type CameraSelection,
  type CameraEdits,
} from "../shared/camera";
import { AppError } from "./errors";
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export function validateCamera(value: unknown, edits: unknown) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !cameraSections.some((s) => s.id === key))
  )
    throw new AppError(400, "Choose one camera term per section.");
  if (edits !== undefined && !record(edits))
    throw new AppError(400, "Invalid camera edits.");
  const camera = {} as CameraSelection;
  const cameraEdits: CameraEdits = {};
  for (const section of cameraSections) {
    const id = value[section.id];
    if (id !== null && !section.terms.some((term) => term.id === id))
      throw new AppError(400, `Choose a supported term for ${section.label}.`);
    Object.assign(camera, { [section.id]: id });
    if (typeof id === "string" && edits && Object.hasOwn(edits, id)) {
      const text = (edits as Record<string, unknown>)[id];
      if (typeof text !== "string" || text.length > 600)
        throw new AppError(
          400,
          "Keep each camera phrase under 600 characters.",
        );
      Object.assign(cameraEdits, { [id]: text });
    }
  }
  if (
    edits &&
    Object.keys(edits).some(
      (id) => !new Set<string | null>(Object.values(camera)).has(id),
    )
  )
    throw new AppError(400, "Camera edits must belong to selected terms.");
  return { camera, cameraEdits };
}
