/**
 * "My last two picks" and "these settings", made explicit before a prompt
 * reaches an agent (issue #23, "Picks and context"). Deterministic and pure,
 * like the voice intent parser: the phrase stays as the person said it and is
 * followed by the ids it means, in brackets, so the agent reads real ids
 * rather than guessing which takes or settings were meant. Portable: no Node
 * or DOM APIs.
 */
import type { AgentContext, AgentPick, AgentSettings } from "./agent-context";

const NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  "a couple": 2,
  "a couple of": 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};
const COUNT = String.raw`\d{1,2}|a couple(?: of)?|one|two|three|four|five|six|seven|eight`;

/**
 * "my last two picks", "the latest pick", "my last 3 picks", "my picks",
 * "these picks". The count is optional; "my picks" and "these picks" mean
 * all. A bare "pick" (the verb, "pick a camera") has no determiner, recency
 * word or count, and is left alone.
 */
const RECENT = "last|latest|newest|most recent|recent";
const PICKS = new RegExp(
  String.raw`\b(?:(my|the|those|these|that|this)\s+)?(?:(${RECENT})\s+)?(?:(${COUNT})\s+)?(?:(${RECENT})\s+)?picks?\b`,
  "gi",
);
const SETTINGS =
  /\b(?:these same|those same|the same|same|these|this|those|my current|my|the current|current)\s+settings?\b/gi;

export interface ResolvedPrompt {
  /** The prompt with each phrase followed by what it refers to. */
  prompt: string;
  /** True when at least one phrase was resolved. */
  changed: boolean;
}

/** "take 3f2a “Penguin on ice” (video)". */
export const pickReference = (pick: AgentPick) =>
  `${pick.kind} ${pick.id} “${pick.name}” (${pick.media}${pick.projectId ? `, project ${pick.projectId}` : ""})`;

/** "flux-3 video, 5 s, 16:9, hd, draft, camera: wide-shot, run location: local". */
export function settingsReference(settings: AgentSettings) {
  const parts = [`${settings.model} ${settings.generator}`];
  if (settings.generator === "upscale") {
    if (settings.upscaleFactor) parts.push(`${settings.upscaleFactor}×`);
    if (settings.sourceId) parts.push(`source ${settings.sourceId}`);
    if (settings.runLocation)
      parts.push(`run location: ${settings.runLocation}`);
    return parts.join(", ");
  }
  if (settings.duration !== undefined) parts.push(`${settings.duration} s`);
  const image = settings.generator === "image" || settings.generator === "edit";
  const ratio = image ? settings.imageAspectRatio : settings.aspectRatio;
  const size = image ? settings.imageResolution : settings.resolution;
  if (ratio) parts.push(ratio);
  if (size) parts.push(size);
  if (settings.draft) parts.push("draft");
  const terms = (record?: Record<string, string | null>) =>
    Object.values(record ?? {}).filter((t): t is string => !!t);
  const camera = settings.cameraEnabled === false ? [] : terms(settings.camera);
  if (camera.length) parts.push(`camera: ${camera.join(", ")}`);
  const light = terms(settings.light);
  if (light.length) parts.push(`light: ${light.join(", ")}`);
  const gaps = Object.keys(settings.gaps ?? {});
  if (gaps.length) parts.push(`gaps: ${gaps.join(", ")}`);
  if (settings.acoustic)
    parts.push(
      `acoustic: ${settings.acoustic.mode} ${settings.acoustic.preset} ${settings.acoustic.level}`,
    );
  if (settings.runLocation) parts.push(`run location: ${settings.runLocation}`);
  return parts.join(", ");
}

function countOf(word: string | undefined) {
  if (!word) return undefined;
  const key = word.toLowerCase().replace(/\s+/g, " ");
  return /^\d+$/.test(key) ? Number(key) : NUMBERS[key];
}

/**
 * Resolves the phrases against the context. Nothing in the context, nothing
 * to resolve: the prompt comes back unchanged. A count beyond the picks the
 * studio has is said plainly in the brackets rather than filled in.
 */
export function resolveContextPhrases(
  prompt: string,
  context: AgentContext | undefined,
): ResolvedPrompt {
  if (!context) return { prompt, changed: false };
  let changed = false;
  let text = prompt.replace(
    PICKS,
    (
      phrase: string,
      determiner?: string,
      recent?: string,
      count?: string,
      recentAfter?: string,
    ) => {
      if (!determiner && !recent && !count && !recentAfter) return phrase;
      const plural = /picks$/i.test(phrase);
      const wanted = countOf(count) ?? (plural ? context.picks.length : 1);
      changed = true;
      if (!context.picks.length) return `${phrase} [no picks in the studio]`;
      const chosen = context.picks.slice(0, Math.max(1, wanted));
      const short =
        wanted > context.picks.length
          ? `; only ${context.picks.length} ${context.picks.length === 1 ? "pick" : "picks"} in the studio`
          : "";
      return `${phrase} [${chosen.map(pickReference).join("; ")}${short}]`;
    },
  );
  text = text.replace(SETTINGS, (phrase: string) => {
    changed = true;
    return context.settings
      ? `${phrase} [${settingsReference(context.settings)}]`
      : `${phrase} [no composer settings in the studio]`;
  });
  return { prompt: text, changed };
}
