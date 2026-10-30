import DeploymentLink from "./DeploymentLink";
import { entryFor } from "../../shared/registry";
import type { KeyKind } from "../../shared/provider";
import type { Generator, VideoModel } from "../../shared/types";
import { useLocalCheck } from "../local-check";
import { runModeLine } from "../run-mode";
import { useSettingSaving, useSettingsStore } from "../settings-store";

/**
 * Tags under the model: where the next run of the held entry executes, from
 * the server's run-location answer (`runModeLine`). The line always takes one
 * reserved row, so the composer keeps its size whatever the tags say.
 */
export default function RunModeLine({
  generator,
  model,
  keyKind,
}: {
  generator: Generator;
  model: VideoModel;
  keyKind: KeyKind | null;
}) {
  const entry = entryFor(generator, model);
  const state = useSettingsStore((s) => s.runLocation);
  // Before the catalogue is read, the entry's default template.
  const template = useSettingsStore(
    (s) =>
      s.workflows[entry.id] ??
      (entry.route === "workflow"
        ? entry.model.slice("workflow/".length)
        : undefined),
  );
  const hosts = useSettingsStore((s) =>
    template ? s.hosts[template] : undefined,
  );
  const saving = useSettingSaving("run-location");
  // Only a graph that will run on this machine asks the local ComfyUI.
  const localGraph =
    entry.route === "workflow" &&
    !entry.deploymentOnly &&
    state?.location === "local" &&
    !state.fixed &&
    !hosts;
  const check = useLocalCheck(
    localGraph,
    String(state?.revision ?? ""),
    entry.id,
  );
  const line = saving
    ? {
        tags: [{ label: "Saving…" }],
        note: "",
        title: "Saving where this runs…",
      }
    : runModeLine({ entry, state, template, hosts, keyKind, check });
  if (entry.deploymentOnly && state?.deployment && !saving)
    return (
      <p className="run-mode">
        <DeploymentLink deployment={state.deployment} />
      </p>
    );
  return (
    <p className="run-mode" title={line.title} aria-label={line.title}>
      {line.tags.map((tag) => (
        <span
          key={tag.label}
          className={`run-mode__tag${tag.warn ? " run-mode__tag--warn" : ""}`}
        >
          {tag.label}
        </span>
      ))}
      {line.note && <span className="run-mode__note">{line.note}</span>}
    </p>
  );
}
