import { laneLabels, lanes } from "../../shared/director/tracks";
import type { Project } from "../../shared/director/types";
import { findMixTemplate } from "../../shared/templates/catalogue";
import { mixUpscaleStep } from "../../shared/templates/mix-upscale";
import "./template-plan.css";

const seconds = (frames: number, fps: number) =>
  `${Number((frames / fps).toFixed(2))} s`;

/**
 * A mix template in the simple Director: the cut as it stands in the
 * project (each slice's start, length and bar), its lanes, and the note that
 * nothing here is generated. Timing is read from the project, so edits in
 * the Editor show here.
 */
export default function MixPlan({ project }: { project: Project }) {
  const template = findMixTemplate(project.id);
  if (!template?.mix) return null;
  const { cut } = template.mix;
  const upscale = mixUpscaleStep(template);
  const { fps, bpm } = project.composition;
  const shots = project.layers.filter((l) => l.track === "shots");
  const all = lanes(project.layers),
    labels = laneLabels(all);
  const barOf = (frame: number) => {
    const beat = Math.round((frame / fps) * ((bpm ?? cut.bpm) / 60));
    return `bar ${Math.floor(beat / 4) + 1}.${(beat % 4) + 1}`;
  };
  return (
    <div className="dir-template-plan" aria-label={`${template.name} cut`}>
      <p className="dir-eyebrow">
        Mix · {template.style.name} · {bpm ?? cut.bpm} BPM · editable mix
      </p>
      <p>{template.description}</p>
      <h3>Cut</h3>
      <ol className="dir-plan-shots">
        {shots.map((layer) => (
          <li key={layer.id} data-shot={layer.id}>
            <strong>{layer.name}</strong>
            <span>
              {seconds(layer.startFrame, fps)} ·{" "}
              {seconds(layer.durationFrames, fps)} · {barOf(layer.startFrame)}
            </span>
          </li>
        ))}
      </ol>
      <h3>Tracks</h3>
      <ul className="dir-plan-tracks">
        {[...all].reverse().map((lane) => (
          <li key={lane.id} data-track={lane.id}>
            <strong>{labels.get(lane.id)}</strong>
            {lane.layers[0].name}
            <span>
              {lane.layers.length} clip{lane.layers.length > 1 ? "s" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p>
        Music: Dimensions · Koshimazaki Mix (Bob Macc master), from{" "}
        {cut.inPointSeconds} s.
      </p>
      {upscale && (
        <section aria-label="Optional step">
          <h3>Optional · {upscale.label}</h3>
          <p data-step="upscale">
            After Render MP4, the cut can be upscaled {upscale.factor}× (
            {cut.width} × {cut.height} to {cut.width * upscale.factor} ×{" "}
            {cut.height * upscale.factor}) with {upscale.entry.label}
            {upscale.entry.open ? ", open weights" : ""}. It runs only if you
            ask: in Camera › Upscale choose {upscale.entry.label}, drop the MP4
            and Generate, which quotes it first (free on a local ComfyUI). An
            agent quotes it and waits for your approval.
          </p>
        </section>
      )}
    </div>
  );
}
