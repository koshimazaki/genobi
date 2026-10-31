import { ltxSlots } from "../../shared/ltx-prompt";
import { gapFieldId } from "../ltx-composer";
import { WORLD_PROMPT_ID, WORLD_PROMPT_LABEL } from "./world-prompt-target";

export type PromptField = HTMLTextAreaElement | HTMLDivElement;
/**
 * Where the Tool prompt destination writes: the prompt the person last
 * worked in, or else the first visible one, in the studio's own order. With
 * none on show it fills nothing and the overlay says so; it never switches
 * the section by itself. The fields belong to other components, so the text goes in the way
 * typing does (the native value setter, then an input event), and each
 * component's own state and limits stay in charge.
 */
const PROMPTS: readonly (readonly [id: string, label: string])[] = [
  ["scroll-prompt", "Scroll brief"],
  ["scroll-cell-prompt", "Scroll cell prompt"],
  ["description", "Camera prompt"],
  // LTX's gaps: the one open tab's field stands where the Camera prompt was.
  ...ltxSlots.map(({ id, label }) => [gapFieldId(id), `${label} gap`] as const),
  ["image-prompt", "Image prompt"],
  ["upscale-prompt", "Upscale prompt"],
  ["project-prompt-text", "Project prompt field"],
  [WORLD_PROMPT_ID, WORLD_PROMPT_LABEL],
];
const PROMPT_IDS = PROMPTS.map(([id]) => id);

export const isPromptId = (id: string) => PROMPT_IDS.includes(id);
export const promptName = (id: string) => LABELS.get(id);
/** A reused field can represent a different document or selected object. */
export const promptScope = (field: PromptField) => field.dataset.voiceScope;
/** Named choices are limited to the same editable fields dictation can use. */
export const visiblePromptChoices = () =>
  PROMPTS.filter(([id]) => promptById(id)).map(([id, label]) => ({
    id,
    label,
  }));

/** What the Tool prompt button calls each field. */
const LABELS = new Map(PROMPTS);

export const promptLabel = (field: PromptField | undefined) =>
  field ? LABELS.get(field.id) : undefined;

/** The Camera composer's own prompts, which end on its Generate button. */
export const isComposerPrompt = (field: PromptField) =>
  field.id !== "project-prompt-text" &&
  field.id !== WORLD_PROMPT_ID &&
  !field.id.startsWith("scroll-");

/**
 * Whether a transcript may be read as a Camera request: not while a Scroll
 * prompt or World Builder's scene direction is where the words would go, so
 * "a ninja falling in a cathedral" stays a scene direction there.
 */
export const readsAsCameraRequest = (
  field: PromptField | undefined,
  worldOpen: boolean,
) =>
  field
    ? !field.id.startsWith("scroll-") && field.id !== WORLD_PROMPT_ID
    : !worldOpen;

/**
 * Once the composer has drawn the new mode: focus its Generate, priced
 * beside it, so one press runs what the person can see. Never presses it.
 * A Generate that cannot run yet leaves focus on the prompt instead.
 * `onFocus` hears where focus went, so Escape there can still close Voice.
 */
export function focusGenerate(
  fallback?: HTMLElement,
  onFocus?: (element: HTMLElement) => void,
) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const generate = document.querySelector<HTMLButtonElement>(
        ".composer .generate-button",
      );
      const field =
        fallback ??
        document.querySelector<HTMLElement>("#image-prompt, #description");
      const target = generate && !generate.disabled ? generate : field;
      target?.focus();
      if (target) onFocus?.(target);
    }),
  );
}

let lastUsed: string | undefined;

/** Remembers the last prompt field focused; returns the cleanup. */
export function trackPromptFocus() {
  const focus = (event: FocusEvent) => {
    const id = (event.target as Element | null)?.id;
    if (id && PROMPT_IDS.includes(id)) lastUsed = id;
  };
  document.addEventListener("focusin", focus);
  return () => document.removeEventListener("focusin", focus);
}

const usable = (id: string) => {
  const field = document.getElementById(id);
  return ((field instanceof HTMLTextAreaElement &&
    !field.disabled &&
    !field.readOnly) ||
    (field instanceof HTMLDivElement &&
      field.isContentEditable &&
      field.getAttribute("aria-disabled") !== "true")) &&
    (typeof field.checkVisibility === "function"
      ? field.checkVisibility()
      : field.offsetParent !== null)
    ? field
    : undefined;
};

/** A prompt by its id, while it is on screen and editable. */
export const promptById = (id: string) =>
  PROMPT_IDS.includes(id) ? usable(id) : undefined;

export function promptTarget(): PromptField | undefined {
  return (
    (lastUsed && usable(lastUsed)) ||
    PROMPT_IDS.map(usable).find((field) => field)
  );
}

/** Replaces the field's text within its own length limit; the field, or none. */
export function fillPrompt(
  text: string,
  field = promptTarget(),
): PromptField | undefined {
  if (!field) return undefined;
  if (field instanceof HTMLDivElement) {
    field.textContent = text.slice(0, 12000);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return field;
  }
  const limit = field.maxLength > 0 ? field.maxLength : text.length;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(field, text.slice(0, limit));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return field;
}
