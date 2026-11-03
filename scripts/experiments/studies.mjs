/** The pilot's study ids, shared by the Node capture runner and the recipes. */
export const STUDIES = Object.freeze([
  "fruit",
  "fruit-dance",
  "fruit-mecha",
  "fruit-mecha-morph",
  "architecture",
  "clockwork",
  "pulse",
  "rubik",
  "cathedral",
  "cathedral-walls",
  "cathedral-gallery",
  "cathedral-gallery-grow",
  "canyon",
  "towers-descent",
  "falling",
  "room",
  "room-walls",
  "pyramid-inside",
  "pyramid-inside-spin",
  "party-walls",
  "studio-walls",
  "diamond",
  "fruit-apple",
  "fruit-banana",
  "fruit-papaya",
  "fruit-apple-banana",
  "fruit-banana-apple",
  "ship-mecha",
  "car-mecha",
]);

/** `<study>/<file>` as the browser may write it; nothing else reaches disk. */
export const OUTPUT_NAME = new RegExp(
  `^(${STUDIES.join("|")})/[a-z0-9-]+\\.(json|png|wav|webm)$`,
);
