import type { Generator, VideoModel } from "../shared/types";
import {
  entriesFor,
  entryFor,
  type Entry,
  type Family,
  type MenuFilter,
} from "../shared/registry";
import { useSettingsStore } from "./settings-store";

/**
 * The Local tick's menu rule: with Local ticked, the menu keeps only what can
 * run on the local ComfyUI, the ready open `workflow` entries whose template
 * names no host of its own (the Openjutsu swap runs on its Comfy deployment).
 * Closed entries stay hidden while Local or Open only is ticked.
 */
export const runsLocally =
  (hosts: Record<string, string[]>, workflows: Record<string, string>) =>
  (entry: Entry) =>
    entry.status === "ready" &&
    entry.route === "workflow" &&
    entry.open &&
    !entry.deploymentOnly &&
    !hosts[workflows[entry.id] ?? entry.model.slice("workflow/".length)];

/**
 * Whether Generate may send this entry with no key at all: it runs on the
 * session's local ComfyUI, which takes none (the server prices it at $0 and
 * asks no key). Read when Generate is pressed, not rendered.
 */
export function runsKeyless(generator: Generator, model?: VideoModel) {
  const entry = entryFor(generator, model);
  const { runLocation, hosts, workflows } = useSettingsStore.getState();
  return (
    runLocation?.location === "local" &&
    !runLocation.fixed &&
    runsLocally(hosts, workflows)(entry)
  );
}

/** The Local tick's filter while the session runs graphs locally; undefined otherwise. */
export function useLocalFilter(): MenuFilter["keep"] {
  const local = useSettingsStore(
    (s) => s.runLocation?.location === "local" && !s.runLocation.fixed,
  );
  const hosts = useSettingsStore((s) => s.hosts);
  const workflows = useSettingsStore((s) => s.workflows);
  return local ? runsLocally(hosts, workflows) : undefined;
}

/**
 * What the menu header says the ticks hide in this family, so the person
 * knows the untick exists: the rows unticking Local would add, else those
 * unticking Open only would. Empty when nothing is hidden.
 */
export function hiddenNote(family: Family, filter: MenuFilter) {
  const shown = entriesFor(family, filter).length;
  const all = entriesFor(family, { hosted: filter.hosted }).length;
  if (filter.keep) {
    const unticked = entriesFor(family, { ...filter, keep: undefined }).length;
    if (unticked > shown) return `${unticked - shown} more with Local off`;
    // Closed rows stay hidden while either tick is on.
    if (all > shown) return `${all - shown} more with Local and Open only off`;
    return "";
  }
  return filter.openOnly && all > shown
    ? `${all - shown} more with Open only off`
    : "";
}
