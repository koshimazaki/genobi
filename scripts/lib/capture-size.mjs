// The size ceiling of a recorded teaser take (scripts/capture-genobi-teaser.mjs):
// a take is encoded at CRF `start` and re-encoded one step higher until it
// fits under the Pages file limit; past `floor` it fails rather than leave
// an oversized or degraded file in public/.
export const MAX_BYTES = 24 * 1024 * 1024;
export const CRF_FLOOR = 28;

/** "keep" the file, "retry" one CRF higher, or "fail". */
export function sizeStep(bytes, crf, max = MAX_BYTES, floor = CRF_FLOOR) {
  if (bytes <= max) return "keep";
  return crf < floor ? "retry" : "fail";
}
