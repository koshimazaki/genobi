// The claim rules for every word a teaser cut puts on screen
// (docs/genobi-teaser-run/README.md#the-claim-rules). A weak model may not
// invent wording: a string is approved when the reference v1 cut or the
// bundled cut already carries it (the owner merged those), and anything new
// is refused until the owner approves it. New wording that names a provider,
// claims "open", or says where a clip came from is refused even then.
import type { MixSpec } from "../../../shared/templates/mix";

/** Parameter names whose string value is drawn on screen. */
export const TEXT_KEYS = new Set([
  "text",
  "line",
  "steps",
  "done",
  "label",
  "eyebrow",
  "title",
  "subtitle",
  "credit",
  "credit1",
  "credit2",
]);

/** Recipes whose words are drawn on screen (pictures and filters carry none). */
const NO_TEXT = new Set([
  "ui-zoom",
  "ui-cursor",
  "slice-glitch",
  "signal-wipe",
]);

export interface OnScreenText {
  layerId: string;
  module: string;
  key: string;
  text: string;
}

/** Every on-screen string in a cut; a `steps` list is split on " / ". */
export function onScreenText(cut: Pick<MixSpec, "layers">): OnScreenText[] {
  const out: OnScreenText[] = [];
  for (const layer of cut.layers) {
    if (NO_TEXT.has(layer.module)) continue;
    for (const [key, value] of Object.entries(layer.parameters)) {
      if (!TEXT_KEYS.has(key) || typeof value !== "string") continue;
      const parts = key === "steps" ? value.split(" / ") : [value];
      for (const text of parts.map((p) => p.trim()).filter(Boolean))
        out.push({ layerId: layer.id, module: layer.module, key, text });
    }
  }
  return out;
}

/** Text compared without case or repeated spaces. */
export const normalise = (text: string) =>
  text.replace(/\s+/g, " ").trim().toUpperCase();

export interface ForbiddenRule {
  id: string;
  pattern: RegExp;
  why: string;
}

/**
 * Wording that is never allowed in a new string. Each `why` is the owner's
 * correction or the rule it came from, in words a weak model can act on.
 */
export const FORBIDDEN: ForbiddenRule[] = [
  {
    id: "tool",
    pattern: new RegExp(atob("bWFnbmlmaWM="), "i"),
    why: "Do not name an unrelated tool: the creature clips are the owner's MiniMax H3 outputs.",
  },
  {
    id: "open-claim",
    pattern:
      /open[ -]?weights?|open[ -]source|local and open|\bopen models?\b/i,
    why: 'Do not claim "open" or "local": the clips came from closed models too (cut 1 said "open weights" over a FLUX 3 shot and was corrected).',
  },
  {
    id: "provenance",
    pattern:
      /\b(made|generated|created|rendered|shot|produced) (with|by|on|in|using)\b/i,
    why: "No provenance claims about where a clip came from. Say what the studio did (CUT IN GENOBI), not where a clip was made.",
  },
  {
    id: "provider",
    pattern:
      /\b(minimax|kling|runway|sora|veo|midjourney|pika|luma|seedance|hailuo)\b/i,
    why: "Do not name a provider over a clip. Model names appear only in the approved wording (the model families callout, FLUX 3 over the forest guardian).",
  },
  {
    id: "invented-result",
    pattern: /draft ready|render(ed)? in \d|\bready\b[^/]*\d+\s?s\b/i,
    why: 'Do not claim a draft, a timing or a duration nobody made (cut 1 said "Draft ready · 20 s" and was corrected).',
  },
  {
    id: "superlative",
    pattern:
      /\b(best|fastest|first ever|only studio|#1|world'?s|revolutionary|guaranteed)\b/i,
    why: "No superlatives or claims nobody can check.",
  },
];

export interface ClaimFinding {
  level: "fail" | "warn";
  layerId: string;
  text: string;
  message: string;
  fix: string;
}

/**
 * Checks each string against the approved list and the forbidden rules.
 * `allowNew` (the owner approved new wording for this run) turns an
 * unapproved but clean string into a warning; forbidden wording still fails.
 */
export function checkClaims(
  cut: Pick<MixSpec, "layers">,
  approved: Iterable<string>,
  allowNew = false,
): ClaimFinding[] {
  const ok = new Set([...approved].map(normalise));
  const findings: ClaimFinding[] = [];
  for (const item of onScreenText(cut)) {
    if (ok.has(normalise(item.text))) continue;
    const broken = FORBIDDEN.filter((rule) => rule.pattern.test(item.text));
    if (broken.length)
      for (const rule of broken)
        findings.push({
          level: "fail",
          layerId: item.layerId,
          text: item.text,
          message: `"${item.text}" breaks the ${rule.id} rule.`,
          fix: `${rule.why} Replace it with an approved string from docs/genobi-teaser-run/claims.md.`,
        });
    else
      findings.push({
        level: allowNew ? "warn" : "fail",
        layerId: item.layerId,
        text: item.text,
        message: `"${item.text}" is new wording the owner has not approved.`,
        fix: allowNew
          ? "Approved for this run with --allow-new-wording: record the owner's yes in memory.json."
          : "Use an approved string (docs/genobi-teaser-run/claims.md), or ask the owner and re-run with --allow-new-wording after a yes.",
      });
  }
  return findings;
}
