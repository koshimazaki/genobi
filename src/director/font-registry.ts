// The faces the Director bundles (shared/director/fonts.ts lists them with
// their licences). Importing the @font-face rules here means any page that
// renders a Director project, the preview and Render MP4 alike, has them.
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/pixelify-sans/latin-400.css";
import "@fontsource/pixelify-sans/latin-700.css";
import "./mix-fonts.css";
import {
  BUNDLED_FONTS,
  isBundled,
  parseFontStack,
  resolveFontStack,
  type FontResolution,
} from "../../shared/director/fonts";

const SAMPLE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Whether this page can draw `family` from a font installed on the
 * computer. `document.fonts.check` answers true for any family without an
 * @font-face rule, so the test is a measurement: the family is there when
 * the sample's width differs from the generic it would otherwise fall to.
 * Brave and Safari hide user-installed fonts, so there it answers false.
 */
export function localFontAvailable(family: string, text = "") {
  if (probe === undefined) {
    try {
      probe = document.createElement("canvas").getContext("2d");
    } catch {
      probe = null;
    }
  }
  if (!probe) return false;
  const sample = SAMPLE + text;
  const name = `"${family.replace(/["\\]/g, "")}"`;
  return ["monospace", "serif"].some((generic) => {
    probe!.font = `400 48px ${generic}`;
    const base = probe!.measureText(sample).width;
    probe!.font = `400 48px ${name}, ${generic}`;
    return probe!.measureText(sample).width !== base;
  });
}

async function load(family: string, weight: number, text: string) {
  const fonts = globalThis.document?.fonts;
  if (!fonts) return false;
  const font = `${weight} 48px "${family}"`;
  try {
    await fonts.load(font, text || SAMPLE);
  } catch {
    return false;
  }
  return fonts.check(font, text || SAMPLE);
}

/**
 * Load every bundled face at the weights a project uses, then resolve the
 * stack. Bundled families are loaded explicitly (an @font-face is only
 * fetched once something draws with it, which a canvas does too late for
 * its first frame).
 */
export async function resolveFont(
  stack: string,
  weight = 400,
  text = "",
): Promise<FontResolution> {
  const loaded = new Map<string, boolean>();
  for (const { family } of parseFontStack(stack))
    if (isBundled(family) && !loaded.has(family))
      loaded.set(family, await load(family, weight, text));
  const first = resolveFontStack(
    stack,
    (f) => localFontAvailable(f, text),
    (f) => loaded.get(f) ?? true,
  );
  // The stand-in a stack falls to is bundled too: load it before drawing.
  if (!loaded.has(first.used) && isBundled(first.used))
    await load(first.used, weight, text);
  return first;
}

/** The bundled faces every recipe may draw with (readouts, captions). */
export async function preloadBundledFonts(weights: Iterable<number> = []) {
  const all = new Set([400, 700, ...weights]);
  await Promise.all(
    BUNDLED_FONTS.flatMap(({ family }) =>
      [...all].map((w) => load(family, w, SAMPLE)),
    ),
  );
}

/**
 * A layer whose recipe takes a free-text `font` CSS stack, with its weight
 * and text. A `font` the schema limits to an enum is a key the recipe maps
 * to its own bundled stack (fx-title), so it is left alone.
 */
export function fontRequest(
  parameters: Record<string, unknown>,
  schema?: { properties?: Record<string, { enum?: unknown[] }> },
) {
  if (typeof parameters.font !== "string") return undefined;
  if (schema?.properties?.font?.enum) return undefined;
  return {
    stack: parameters.font,
    weight: typeof parameters.weight === "number" ? parameters.weight : 400,
    text: typeof parameters.text === "string" ? parameters.text : "",
  };
}
