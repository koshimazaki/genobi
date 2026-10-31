import type { DirectorCommand } from "./commands";
import { refused, type Builder } from "./feedback-builder";
import { layerName, value } from "./feedback-labels";

/** Remove first, so a later move can occupy the space the person cleared. */
export function removedClipSteps(b: Builder) {
  const kept = new Set(b.current.project.layers.map((l) => l.id));
  for (const layer of [...b.work.project.layers]) {
    if (kept.has(layer.id)) continue;
    const label = `removed ${layer.kind} ${layerName(layer)}`;
    const error = b.attempt([
      {
        command: { op: "remove-clip", layerId: layer.id },
        describe: () => label,
      },
    ]);
    if (error)
      b.miss({
        kind: "layer",
        id: layer.id,
        field: "layer",
        label,
        reason: refused(error),
      });
  }
}

/** Visibility and audio gain, without silently clearing a person's lock. */
export function clipSettingSteps(b: Builder) {
  for (const target of b.current.project.layers) {
    const now = b.layer(target.id);
    if (!now) continue;
    const edits: { command: DirectorCommand; label: string; field: string }[] =
      [];
    if (!!now.muted !== !!target.muted)
      edits.push({
        command: { op: "set-muted", layerId: now.id, muted: !!target.muted },
        label: `${layerName(now)} ${target.muted ? "muted/hidden" : "unmuted/shown"}`,
        field: "muted",
      });
    if (
      now.kind === "audio" &&
      target.kind === "audio" &&
      now.gain !== target.gain
    )
      edits.push({
        command: { op: "set-gain", layerId: now.id, gain: target.gain },
        label: `${layerName(now)} gain ${value(now.gain)} → ${value(target.gain)}`,
        field: "gain",
      });
    for (const { command, label, field } of edits) {
      const error = b.attempt([{ command, describe: () => label }]);
      if (error)
        b.miss({
          kind: "layer",
          id: now.id,
          field,
          label,
          reason: refused(error),
        });
    }
  }
}
