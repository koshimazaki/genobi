import { registry } from "../registry";
import type { Entry } from "../registry-types";
import { templateEntries } from "../templates/plan";
import type { HouseTemplate, Tier } from "../templates/types";
import { footageEntries } from "./catalogue";

/**
 * A tier in words, for the Filters panel's Tier field (`tierOf`, checked
 * against the registry's `open` flags). The card badge names models instead.
 */
export const TIER_LABEL: Record<Tier, string> = {
  open: "Open models",
  "semi-open": "Semi-open",
  premium: "API model",
};

/**
 * One registry entry in words: "FLUX 3 image to video (API)" for a closed
 * entry, "LTX-2.5 Fast text to video (open weights)" for an open one.
 */
export function modelLine(id: string) {
  const entry = registry.find((e) => e.id === id);
  if (!entry) return id;
  const task = (entry.task ?? "").split(" · ")[0].toLowerCase();
  // "FLUX 3 Image Klein" already says image; an entry may have no task.
  const name = entry.label.toLowerCase().includes(task)
    ? entry.label
    : `${entry.label} ${task}`;
  return `${name} (${entry.open ? "open weights" : "API"})`;
}

/** The models a card's recipe uses, in words; empty for a mix. */
export const cardModels = (template: HouseTemplate) =>
  templateEntries(template).map(modelLine);

const entryOf = (id: string) => registry.find((e) => e.id === id);
/** What an entry makes; a coming entry makes nothing yet. */
const made = (e: Entry | undefined) =>
  e?.status === "ready" ? e.generator : undefined;

/** Words a model's name drops: a speed tier the registry labels carry. */
const VARIANT = new Set(["fast"]);

/**
 * A registry entry's model, as a badge names it: its label before any " · "
 * qualifier, without a word inside it that repeats its generator ("FLUX 3 Image Klein"
 * is "FLUX 3 Klein") or a speed tier ("LTX-2.5 Fast" is "LTX-2.5"), plus
 * the generator when the registry gives that name to entries that make
 * different things ("FLUX 3" makes images and video, so "FLUX 3 video").
 */
export function modelName(id: string) {
  const entry = entryOf(id);
  if (!entry) return id;
  const words = (e: Entry) =>
    e.label
      .split(" · ")[0]
      .split(" ")
      .filter((w, i, all) => {
        const word = w.toLowerCase();
        // A generator word between others only ("FLUX Video Upscale" stays).
        const inner = i < all.length - 1 && word === made(e);
        return !inner && !VARIANT.has(word);
      })
      .join(" ");
  const name = words(entry);
  const makes = made(entry);
  const shared = registry.some(
    (e) => made(e) && made(e) !== makes && words(e) === name,
  );
  return shared && makes ? `${name} ${makes}` : name;
}

/** "open weights", "API", or "open + API" for a mix of both. */
function route(ids: readonly string[]) {
  const open = ids.map((id) => entryOf(id)?.open);
  if (open.every(Boolean)) return "open weights";
  return open.some(Boolean) ? "open + API" : "API";
}

/**
 * The entries a badge names: a mix's footage; a recipe's video models (its
 * image, edit and music steps are in the tooltip), or every entry when it
 * makes no video.
 */
function namedEntries(template: HouseTemplate) {
  if (template.mix) return footageEntries(template);
  const ids = templateEntries(template);
  const video = ids.filter((id) => made(entryOf(id)) === "video");
  return video.length ? video : ids;
}

/**
 * The badge: the models the card runs and their route, read from the
 * registry ("FLUX 3 video · API", "MiniMax H3 · open weights"). A mix names
 * the model its footage came from, or "Finished cut" when its media is
 * mixed. The route counts every entry the recipe runs, so a recipe with
 * one closed step reads "open + API". Preview footage the recipe did not
 * make is named by its own label (`footageEntries`), never by the badge.
 */
export function galleryBadge(template: HouseTemplate) {
  const models = cardModels(template);
  const named = namedEntries(template);
  const names = [...new Set(named.map(modelName))];
  const label = names.length
    ? `${names.join(" + ")} · ${route([...named, ...templateEntries(template)])}`
    : "Finished cut";
  return {
    tier: template.tier,
    label,
    detail: models.length
      ? models.join(", ")
      : template.mix && named.length
        ? `Nothing to generate: a finished cut of ${names.join(" + ")} (${route(named)}) clips`
        : "Nothing to generate: a finished cut of bundled clips",
  };
}

/**
 * A preview clip's label: "Preview footage", plus the model that made the
 * clip the card plays when the owner recorded one ("Preview footage ·
 * MiniMax H3"), so the card says what the footage is without the badge
 * claiming the recipe made it. The badge keeps naming the recipe's models.
 */
export function footageLabel(template: HouseTemplate) {
  const names = [...new Set(footageEntries(template).map(modelName))];
  return names.length
    ? `Preview footage · ${names.join(" + ")}`
    : "Preview footage";
}

/** The same in a sentence: "made with MiniMax H3 (open weights)", or "". */
export function footageMadeWith(template: HouseTemplate) {
  const ids = footageEntries(template);
  return ids.length
    ? `made with ${[...new Set(ids.map(modelName))].join(" + ")} (${route(ids)})`
    : "";
}
