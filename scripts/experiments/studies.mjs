/** The pilot's study ids, shared by the Node capture runner and the recipes. */
export const STUDIES = Object.freeze([
  "fruit",
  "fruit-dance",
  "architecture",
  "clockwork",
  "pulse",
  "rubik",
  "cathedral",
  "cathedral-walls",
  "canyon",
  "falling",
  "room",
  "room-walls",
  "pyramid-inside",
]);

/** `<study>/<file>` as the browser may write it; nothing else reaches disk. */
export const OUTPUT_NAME = new RegExp(
  `^(${STUDIES.join("|")})/[a-z0-9-]+\\.(json|png|wav|webm)$`,
);
