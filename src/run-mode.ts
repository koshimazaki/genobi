import type { ReadyEntry } from "../shared/registry";
import type { RunLocationState } from "../shared/comfy/run-location";
import type { DestinationKind } from "../shared/comfy/destination";
import {
  keyKind as kindOf,
  payingKeyKind,
  requiredKeyKind,
  type KeyKind,
  type ProviderChoice,
} from "../shared/provider";
import type { KeySlots } from "../shared/keys";
import type { Generator, VideoModel } from "../shared/types";

/**
 * The run-mode line under the composer's model: short tags saying where the
 * next run of the held entry executes ("Open weights", "Local ComfyUI";
 * "API", "Comfy Router"), from the entry's route, the session's run location (the server's
 * answer, never a guess) and, for a graph that names its own hosts, those
 * hosts. A tag with `warn` predicts a failure (the local ComfyUI is not
 * answering, or lacks what the graph needs); `note` is the short detail that
 * shares the line, and `title` the whole sentence for hover and screen readers.
 */
export interface RunTag {
  label: string;
  warn?: boolean;
}
export interface RunModeLine {
  tags: RunTag[];
  note: string;
  title: string;
}

/** What `GET /api/settings/workflows?check=local` found for one template. */
export interface LocalTemplateCheck {
  missingNodes: string[];
  missingModels: string[];
}
export interface LocalCheck {
  reachable: boolean;
  templates: Record<string, LocalTemplateCheck>;
}

export interface RunModeInput {
  entry: ReadyEntry;
  /** The run location the lane last applied; undefined until it is read. */
  state?: RunLocationState;
  /** The template the session runs behind a workflow entry. */
  template?: string;
  /** That template's own hosts, when it names them. */
  hosts?: readonly string[];
  /** The visitor's key kind; null when the studio holds none here. */
  keyKind: KeyKind | null;
  /** The latest local check, when one was made. */
  check?: LocalCheck | null;
}

const SAY = {
  router: "Runs on Comfy Router on your Comfy key",
  bfl: "Runs on BFL's API on your BFL key",
  either: "Runs on Comfy Router on a Comfy key, or BFL's API on a BFL key",
  cloud: "Runs on Comfy Cloud on your Comfy key",
  deployment: "Runs on the Comfy deployment on your Comfy key",
  local: "Runs on the local ComfyUI",
} as const;
const TAG = {
  router: "Comfy Router",
  bfl: "BFL",
  either: "Comfy Router or BFL",
  cloud: "Comfy Cloud",
  deployment: "Comfy deployment",
  local: "Local ComfyUI",
} as const;
type Where = keyof typeof SAY;

const list = (names: string[]) =>
  names.length > 3
    ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
    : names.join(", ");

/** Where the server will send a run of a graph: `WorkflowSettings.hostFor`. */
function hostOf(
  location: DestinationKind,
  hosts?: readonly string[],
): DestinationKind {
  if (!hosts?.length) return location;
  return (hosts.includes(location) ? location : hosts[0]) as DestinationKind;
}

/**
 * The key a run of this entry spends: the visit's key, else the server slot
 * `chooseKeyKind` picks, the rule the server's `runCredential` uses. Null
 * when no key held here can run it. The run-mode tag and the price name it.
 */
export function runPayer(
  visitKey: string,
  slots: Partial<KeySlots> | undefined,
  generator: Generator,
  model: VideoModel,
  preference: ProviderChoice = "auto",
): KeyKind | null {
  const held = visitKey ? { [kindOf(visitKey)]: true } : (slots ?? {});
  return payingKeyKind(generator, model, held, preference) ?? null;
}

/** Where an entry that is not a graph runs: Router or BFL, never local. */
function apiWhere(entry: ReadyEntry, keyKind: KeyKind | null): Where {
  if (entry.route === "bfl") return "bfl";
  const needs = requiredKeyKind(entry.videoModel);
  if (needs !== "either") return needs === "comfy" ? "router" : "bfl";
  // A FLUX Router entry runs on BFL direct with a BFL key (`chooseKey`).
  return keyKind === "comfy" ? "router" : keyKind === "bfl" ? "bfl" : "either";
}

function line(
  entry: ReadyEntry,
  where: Where,
  extra: { note?: string; said?: string; warn?: boolean } = {},
): RunModeLine {
  const tags: RunTag[] = [
    // The weights first, then the endpoint: "Open weights · Comfy Cloud",
    // "API · Comfy Router".
    { label: entry.open ? "Open weights" : "API" },
    { label: TAG[where], ...(extra.warn ? { warn: true } : {}) },
  ];
  return {
    tags,
    note: extra.note ?? "",
    title: SAY[where] + (extra.said ?? (extra.note ? ` · ${extra.note}` : "")),
  };
}

export function runModeLine({
  entry,
  state,
  template,
  hosts,
  keyKind,
  check,
}: RunModeInput): RunModeLine {
  const local = state?.location === "local";
  if (entry.route !== "workflow")
    return line(
      entry,
      apiWhere(entry, keyKind),
      local ? { note: "Local applies to open workflows only" } : {},
    );
  if (!state)
    return {
      tags: [{ label: "Checking…" }],
      note: "",
      title: "Checking where this runs…",
    };
  if (state.fixed)
    return line(entry, "cloud", {
      note: "the hosted studio always uses Comfy Cloud",
    });
  const host = hostOf(state.location, hosts);
  if (host !== state.location)
    // A pinned graph (Openjutsu): its own host, whatever the tick says.
    return line(entry, host === "local" ? "local" : host, {
      note: "its own host, not Local or Cloud",
    });
  if (host !== "local") return line(entry, host);
  if (
    check?.reachable === false ||
    (!check && state.local?.reachable === false)
  )
    return line(entry, "local", {
      warn: true,
      note: "not answering",
      said: ", which is not answering. Start ComfyUI, or untick Local",
    });
  const found = template ? check?.templates[template] : undefined;
  if (found?.missingNodes.length)
    return line(entry, "local", {
      warn: true,
      note: `lacks nodes ${list(found.missingNodes)}`,
      said: `, which lacks the nodes ${list(found.missingNodes)}`,
    });
  if (found?.missingModels.length)
    return line(entry, "local", {
      warn: true,
      note: `lacks ${list(found.missingModels)}`,
      said: `, which lacks the model files for ${list(found.missingModels)}`,
    });
  return line(entry, "local");
}
