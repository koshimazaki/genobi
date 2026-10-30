// The prompt steps of the feedback diff: the global prompt, then each
// clip's prompt and typed directions, as the person left them. Each is its
// own command, so a rewritten prompt and a changed menu read apart.
import { DIRECTION_FIELDS, type DirectionsPatch } from "./directions";
import { layerName, short } from "./feedback-labels";
import { refused, type Builder } from "./feedback-builder";
import { stable } from "./feedback-residual";

export function promptSteps(b: Builder) {
  const id = b.current.project.id;
  const was = b.work.project.globalPrompt ?? "",
    now = b.current.project.globalPrompt ?? "";
  if (was !== now) {
    const error = b.attempt([
      {
        command: { op: "set-global-prompt", text: now },
        describe: () =>
          now
            ? `global prompt rewritten: "${short(now, 80)}"`
            : "global prompt cleared",
      },
    ]);
    if (error)
      b.miss({
        kind: "project",
        id,
        field: "globalPrompt",
        label: "global prompt rewritten",
        reason: refused(error),
      });
  }
  for (const target of b.current.project.layers) {
    const layer = b.layer(target.id);
    if (!layer) continue;
    const text = target.prompt ?? "";
    if ((layer.prompt ?? "") !== text) {
      const error = b.attempt([
        {
          command: { op: "set-clip-prompt", layerId: target.id, text },
          describe: () =>
            text
              ? `${layerName(target)} prompt: "${short(text, 80)}"`
              : `${layerName(target)} prompt cleared`,
        },
      ]);
      if (error)
        b.miss({
          kind: "layer",
          id: target.id,
          field: "prompt",
          label: `${layerName(target)} prompt rewritten`,
          reason: refused(error),
        });
    }
    const patch: Record<string, unknown> = {};
    for (const key of DIRECTION_FIELDS) {
      const before = layer.directions?.[key],
        after = target.directions?.[key];
      if (stable(before) !== stable(after)) patch[key] = after ?? null;
    }
    if (!Object.keys(patch).length) continue;
    const error = b.attempt([
      {
        command: {
          op: "set-clip-directions",
          layerId: target.id,
          directions: patch as DirectionsPatch,
        },
        describe: () =>
          `${layerName(target)} directions: ${Object.entries(patch)
            .map(([k, v]) => `${k} ${v === null ? "cleared" : stable(v)}`)
            .join(", ")}`,
      },
    ]);
    if (error)
      b.miss({
        kind: "layer",
        id: target.id,
        field: "directions",
        label: `${layerName(target)} directions changed`,
        reason: refused(error),
      });
  }
}
