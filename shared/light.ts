/**
 * The Light picker, LTX only. Its terms are the "Visual Details" lists of
 * Lightricks' LTX-2.5 prompt guide (https://ltx.io/blog/ltx-2-5-prompt-guide,
 * 10 August 2026): Lighting, Color Palette and Atmosphere, named as the guide
 * names them. The guide gives terms, not sentences, so every sentence below is
 * written for this studio, in the style of the LTX wording in `camera.ts`: one
 * present-tense sentence that keeps "one coherent light logic per shot", as
 * the guide asks. At most one term per group; a person's edit wins.
 */
export const LIGHT_SOURCE =
  "studio-authored sentences on the LTX-2.5 guide's terms";

const term = <T extends string>(id: T, label: string, ltx: string) => ({
  id,
  label,
  ltx,
});

export const lightGroups = [
  {
    id: "lighting",
    label: "Lighting",
    terms: [
      term(
        "flickering-candles",
        "Flickering candles",
        "Flickering candlelight lights the scene, warm light and soft shadows wavering across every surface.",
      ),
      term(
        "neon-glow",
        "Neon glow",
        "A neon glow bathes the scene in saturated colour that reflects off nearby surfaces.",
      ),
      term(
        "natural-sunlight",
        "Natural sunlight",
        "Natural sunlight lights the scene from one direction, casting soft, even shadows.",
      ),
      term(
        "dramatic-shadows",
        "Dramatic shadows",
        "Hard light from one side carves dramatic shadows across the subject.",
      ),
    ],
  },
  {
    id: "palette",
    label: "Color palette",
    terms: [
      term(
        "vibrant",
        "Vibrant",
        "The colour palette is vibrant, with rich, saturated hues.",
      ),
      term(
        "muted",
        "Muted",
        "The colour palette is muted, with soft, desaturated tones.",
      ),
      term(
        "monochromatic",
        "Monochromatic",
        "The palette is monochromatic, built from shades of a single colour.",
      ),
      term(
        "high-contrast",
        "High contrast",
        "The image is high contrast, with deep blacks and bright highlights.",
      ),
    ],
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    terms: [
      term(
        "fog",
        "Fog",
        "A thin fog hangs in the air, softening the background.",
      ),
      term(
        "rain",
        "Rain",
        "Rain falls steadily through the frame, wetting every surface.",
      ),
      term(
        "dust",
        "Dust",
        "Dust drifts slowly through the air, catching the light.",
      ),
      term(
        "smoke",
        "Smoke",
        "Smoke curls slowly through the air around the subject.",
      ),
      term(
        "particles",
        "Particles",
        "Fine particles float through the air, glinting in the light.",
      ),
    ],
  },
] as const;

export type LightGroup = (typeof lightGroups)[number];
export type LightGroupId = LightGroup["id"];
export type LightTermId = LightGroup["terms"][number]["id"];
export type LightTerm = { id: LightTermId; label: string; ltx: string };
export type LightSelection = {
  [G in LightGroup as G["id"]]: G["terms"][number]["id"] | null;
};
export type LightEdits = Partial<Record<LightTermId, string>>;
export const emptyLight: LightSelection = {
  lighting: null,
  palette: null,
  atmosphere: null,
};
export const lightTerms: readonly LightTerm[] = lightGroups.flatMap((group) => [
  ...group.terms,
]);
/** Room for one edited sentence, as a camera term's edit has. */
export const LIGHT_EDIT_LIMIT = 600;

export const hasLight = (selection: LightSelection) =>
  lightGroups.some((group) => selection[group.id] !== null);

/** The chosen terms in group order, each with its sentence; an edit wins. */
export function lightSentences(
  selection: LightSelection,
  edits: LightEdits = {},
) {
  return lightGroups.flatMap((group) => {
    const chosen = (group.terms as readonly LightTerm[]).find(
      (item) => item.id === selection[group.id],
    );
    if (!chosen) return [];
    const edit = edits[chosen.id];
    return [{ group, term: chosen, text: edit ?? chosen.ltx }];
  });
}

/** The chosen terms' names, or "No light" when none is chosen. */
export const lightLabel = (selection: LightSelection) =>
  lightSentences(selection)
    .map(({ term }) => term.label)
    .join(" · ") || "No light";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * A Light choice from a request or a saved take: exactly the three groups,
 * each a term of that group or null, and edits only for known terms, each a
 * string of at most 600 characters. Anything else is null.
 */
export function readLight(
  value: unknown,
  edits: unknown,
): { light: LightSelection; lightEdits: LightEdits } | null {
  if (!isRecord(value) || !isRecord(edits)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== lightGroups.length ||
    !lightGroups.every((group) => keys.includes(group.id))
  )
    return null;
  const light = { ...emptyLight } as Record<LightGroupId, string | null>;
  for (const group of lightGroups) {
    const id = value[group.id];
    if (id === null) continue;
    if (!group.terms.some((item) => item.id === id)) return null;
    light[group.id] = id as string;
  }
  const lightEdits: LightEdits = {};
  for (const [id, text] of Object.entries(edits)) {
    if (!lightTerms.some((item) => item.id === id)) return null;
    if (typeof text !== "string" || text.length > LIGHT_EDIT_LIMIT) return null;
    lightEdits[id as LightTermId] = text;
  }
  return { light: light as LightSelection, lightEdits };
}
