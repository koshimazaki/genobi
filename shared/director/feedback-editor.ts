// The feedback diff's steps for the Editor commands (`editor-commands.ts`):
// the composition's rate and length, the project's and layers' names, and
// the tracks' stacking order. Frame rate goes first, since it moves every
// frame the later steps compare; a longer composition goes early, so clips
// can move into the new time, and a shorter one last, once they have left.
import { refused, type Builder } from "./feedback-builder";
import { layerName, value } from "./feedback-labels";
import { lanes } from "./tracks";

export function fpsStep(b: Builder) {
  const was = b.work.project.composition.fps,
    fps = b.current.project.composition.fps;
  if (was === fps) return;
  const error = b.attempt([
    {
      command: { op: "set-fps", fps },
      describe: () => `frame rate ${was} → ${fps} fps`,
    },
  ]);
  if (error)
    b.miss({
      kind: "project",
      id: b.current.project.id,
      field: "composition.fps",
      label: `frame rate ${was} → ${fps} fps`,
      reason: refused(error),
    });
}

/** Early, the attempt is quiet: a refusal is retried after the clip steps. */
export function durationStep(b: Builder, last: boolean) {
  const was = b.work.project.composition.durationFrames,
    durationFrames = b.current.project.composition.durationFrames;
  if (was === durationFrames || (!last && durationFrames < was)) return;
  const label = `length ${was} → ${durationFrames} frames`;
  const error = b.attempt([
    {
      command: { op: "set-duration", durationFrames },
      describe: () => label,
    },
  ]);
  if (error && last)
    b.miss({
      kind: "project",
      id: b.current.project.id,
      field: "composition.durationFrames",
      label,
      reason: refused(error),
    });
}

export function renameSteps(b: Builder) {
  const id = b.current.project.id,
    was = b.work.project.name,
    name = b.current.project.name;
  if (was !== name) {
    const error = b.attempt([
      {
        command: { op: "rename-project", name },
        describe: () => `project renamed ${value(was)} → ${value(name)}`,
      },
    ]);
    if (error)
      b.miss({
        kind: "project",
        id,
        field: "name",
        label: `project renamed ${value(was)} → ${value(name)}`,
        reason: refused(error),
      });
  }
  for (const target of b.current.project.layers) {
    const now = b.layer(target.id);
    if (!now || now.name === target.name) continue;
    const label = `${layerName(now)} renamed to ${value(target.name)}`;
    const error = b.attempt([
      {
        command: { op: "rename-layer", layerId: target.id, name: target.name },
        describe: () => label,
      },
    ]);
    if (error)
      b.miss({
        kind: "layer",
        id: target.id,
        field: "name",
        label,
        reason: refused(error),
      });
  }
}

/**
 * The tracks both copies hold, into the person's stacking order: from the
 * bottom, a track out of place moves down to its slot, carried by one of its
 * unlocked clips; when all of its clips are locked, the track in its slot
 * moves up past it instead. What neither can move is left for the residual
 * pass, which lists the order that remains.
 */
export function orderSteps(b: Builder) {
  const target = lanes(b.current.project.layers).map((l) => l.id);
  for (const want of target)
    for (let tries = 0; tries <= target.length; tries++) {
      const all = lanes(b.work.project.layers);
      const ids = all.map((l) => l.id);
      const order = ids.filter((id) => target.includes(id));
      const slot = target.filter((id) => ids.includes(id)).indexOf(want);
      if (slot < 0 || order[slot] === want) break;
      const from = ids.indexOf(want),
        to = ids.indexOf(order[slot]);
      const down = all[from].layers.find((l) => !l.locked);
      const up = all[to].layers.find((l) => !l.locked);
      const carrier = down ?? up;
      if (!carrier) return;
      const by = down ? to - from : from - to;
      const error = b.attempt([
        {
          command: { op: "reorder-layer", layerId: carrier.id, by },
          describe: () =>
            `track of ${layerName(carrier)} moved ${by > 0 ? "up" : "down"} ${Math.abs(by)} in the stack`,
        },
      ]);
      if (error) return;
    }
}
