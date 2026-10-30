/**
 * The Director's font registry: the faces the studio bundles (with a
 * verified licence, see docs/motion-fonts.md) and the rule that turns a
 * recipe's CSS family stack into the face a frame is actually drawn in.
 *
 * The preview and Render MP4 both draw through `DirectorRenderer`, which
 * resolves every `font` parameter with `resolveFontStack` before a recipe
 * sees it. A family the page cannot use (a font installed on one computer
 * and hidden by the browser, as Brave and Safari do) is dropped from the
 * stack, so the frame falls to the stack's first bundled face, and to the
 * documented stand-in when the stack names none. Portable: no DOM here.
 */

export interface BundledFont {
  /** The CSS family name the @font-face rules register. */
  family: string;
  /** Weights shipped (a variable face lists its range ends). */
  weights: readonly number[];
  licence: string;
  /** The npm package that self-hosts the files, or their folder. */
  source: string;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  {
    family: "Instrument Sans Variable",
    weights: [400, 700],
    licence: "SIL OFL 1.1",
    source: "@fontsource-variable/instrument-sans",
  },
  {
    family: "IBM Plex Mono",
    weights: [400],
    licence: "SIL OFL 1.1",
    source: "@fontsource/ibm-plex-mono",
  },
  {
    family: "Pixelify Sans",
    weights: [400, 700],
    licence: "SIL OFL 1.1",
    source: "@fontsource/pixelify-sans",
  },
  {
    // One face; its @font-face declares 400 to 700 so no bold is synthesised.
    family: "Nokia Cellphone FC",
    weights: [400, 700],
    licence: "Zeh Fernando's notice: free to distribute, not to sell",
    source: "public/motion/fonts/nokia-fc (src/director/mix-fonts.css)",
  },
];

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
]);

/** The bundled face drawn when a stack names no usable family. */
export function standIn(generic?: string) {
  return generic === "monospace" || generic === "ui-monospace"
    ? "IBM Plex Mono"
    : "Instrument Sans Variable";
}

export interface StackEntry {
  family: string;
  /** An unquoted CSS generic keyword such as `sans-serif`. */
  generic: boolean;
}

/** Family names match case-insensitively in CSS; spaces are collapsed. */
const key = (family: string) =>
  family.trim().replace(/\s+/g, " ").toLowerCase();

/** The registry's spelling of a bundled family, whatever the case. */
export const bundledName = (family: string) =>
  BUNDLED_FONTS.find((f) => key(f.family) === key(family))?.family;

/**
 * Split a CSS `font-family` value into its families, quotes removed. A
 * bundled family comes back in the registry's spelling, so
 * `"pixelify sans"` is the bundled Pixelify Sans.
 */
export function parseFontStack(stack: string): StackEntry[] {
  const out: StackEntry[] = [];
  for (const part of stack.split(",")) {
    const raw = part.trim();
    if (!raw) continue;
    const quoted = /^(["']).*\1$/.test(raw);
    const name = (quoted ? raw.slice(1, -1) : raw).trim();
    if (!name) continue;
    const generic = !quoted && GENERIC.has(name.toLowerCase());
    out.push({
      family: generic ? name.toLowerCase() : (bundledName(name) ?? name),
      generic,
    });
  }
  return out;
}

const quote = (e: StackEntry) =>
  e.generic ? e.family : `"${e.family.replace(/["\\]/g, "")}"`;

export const isBundled = (family: string) => bundledName(family) !== undefined;

export interface FontResolution {
  /** The first family the stack asks for. */
  requested: string;
  /** The family the frame is drawn in. */
  used: string;
  /** Families before `used` that this page cannot use. */
  missing: string[];
  /** `used` is installed on this computer, not bundled. */
  local: boolean;
  /** The stack handed to the recipe: unusable families removed. */
  stack: string;
}

/**
 * Resolve a stack against what this page can draw. `available` answers for
 * a family that is not bundled (a local font); bundled faces count as
 * available unless `loaded` says the file failed to load.
 */
export function resolveFontStack(
  stack: string,
  available: (family: string) => boolean,
  loaded: (family: string) => boolean = () => true,
): FontResolution {
  const entries = parseFontStack(stack);
  const requested = entries[0]?.family ?? standIn();
  const missing: string[] = [];
  let index = -1;
  let generic: string | undefined;
  for (const [i, e] of entries.entries()) {
    if (e.generic) {
      generic = e.family.toLowerCase();
      break;
    }
    const ok = isBundled(e.family) ? loaded(e.family) : available(e.family);
    if (ok) {
      index = i;
      break;
    }
    missing.push(e.family);
  }
  if (index >= 0) {
    const used = entries[index].family;
    const rest = entries.slice(index);
    const tail = rest.some((e) => isBundled(e.family))
      ? []
      : [{ family: standIn(lastGeneric(entries)), generic: false }];
    return {
      requested,
      used,
      missing,
      local: !isBundled(used),
      stack: [...rest, ...tail].map(quote).join(", "),
    };
  }
  const used = standIn(generic ?? lastGeneric(entries));
  const after = entries.filter(
    (e) => e.generic || (!missing.includes(e.family) && e.family !== used),
  );
  return {
    requested,
    used,
    missing,
    local: false,
    stack: [{ family: used, generic: false }, ...after].map(quote).join(", "),
  };
}

function lastGeneric(entries: StackEntry[]) {
  return [...entries]
    .reverse()
    .find((e) => e.generic)
    ?.family.toLowerCase();
}

/** Where a page without any local font would land: bundled faces only. */
export const portableFallback = (stack: string) =>
  resolveFontStack(stack, () => false).used;

/** The line the inspector shows under a layer's font. */
export function fontNotice(r: FontResolution, stack: string) {
  if (r.missing.length)
    return {
      warn: true,
      text: `Font '${r.missing[0]}' isn't available here; showing ${r.used}.`,
    };
  if (r.local)
    return {
      warn: true,
      text: `Showing ${r.used}, installed on this computer but not bundled: a browser or machine without it shows ${portableFallback(stack)}.`,
    };
  return { warn: false, text: `Showing ${r.used} (bundled).` };
}
