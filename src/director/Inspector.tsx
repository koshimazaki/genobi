import type { Layer, Project } from "../../shared/director/types";
import Icon from "../components/Icon";
import ClipSource from "./ClipSource";
import SelectMenu from "../components/SelectMenu";
import PromptField from "./PromptField";
import FontNotice from "./FontNotice";
import { ClipSendButton, ClipSendStatus } from "./ClipPromptSend";
import {
  CLIP_PROMPT_LIMIT,
  directionWords,
} from "../../shared/director/directions";
/** A recipe parameter with this pattern is a colour (`#rrggbb`). */
const HEX = "^#[0-9a-fA-F]{6}$";
interface Props {
  close: () => void;
  project: Project;
  layer?: Layer;
  edit: (patch: Partial<Layer>) => void;
  duplicate: () => void;
  remove: () => void;
  reorder: (delta: number) => void;
  replace: () => void;
  /** Runs a Director command; returns the refusal, or "". */
  command: (command: unknown) => string;
  disabled: boolean;
}
export default function Inspector({
  close,
  project,
  layer: l,
  edit,
  duplicate,
  remove,
  reorder,
  replace,
  command,
  disabled,
}: Props) {
  if (!l)
    return <aside className="dir-inspector">Select a layer to edit.</aside>;
  const num = (
    name: string,
    value: number,
    change: (n: number) => void,
    min?: number,
    max?: number,
    step = 1,
  ) => (
    <label key={name}>
      {name}
      <input
        aria-label={name}
        type="number"
        key={String(value)}
        defaultValue={value}
        min={min}
        max={max}
        // A fractional step is only how far the arrows nudge: any fraction
        // in range is taken, since a grid counted from `min` (0.01 + 0.05k)
        // would refuse 0.4 or 1. Whole-number fields keep their grid.
        step={step}
        onBlur={(e) => {
          const { value, validity } = e.currentTarget;
          const offGrid = validity.stepMismatch && step === 1;
          if (
            value !== "" &&
            !validity.badInput &&
            !validity.rangeUnderflow &&
            !validity.rangeOverflow &&
            !offGrid
          )
            change(Number(value));
        }}
      />
    </label>
  );
  return (
    <aside className="dir-inspector">
      <header>
        <span>CLIP INSPECTOR</span>
        <ClipSendButton
          key={l.id}
          projectId={project.id}
          layerId={l.id}
          locked={l.locked}
          disabled={disabled}
        />
        <small>
          {l.kind === "graphics" ? project.modules[l.moduleId].engine : l.kind}
        </small>
        <button
          className="dir-icon-button"
          onClick={close}
          aria-label="Close inspector"
          title="Close inspector"
        >
          <Icon name="eyeOff" size={14} />
        </button>
      </header>
      <div className="dir-lock">
        <strong>{l.name}</strong>
        <button
          disabled={disabled}
          aria-pressed={l.locked}
          onClick={() => edit({ locked: !l.locked })}
        >
          {l.locked ? "Unlock" : "Lock"}
        </button>
      </div>
      <ClipSource project={project} layer={l} />
      <fieldset disabled={disabled || l.locked}>
        <label>
          Name
          <input
            key={l.id + l.name}
            defaultValue={l.name}
            maxLength={120}
            onBlur={(e) => edit({ name: e.target.value })}
          />
        </label>
        <PromptField
          key={l.id}
          label="Prompt"
          value={l.prompt ?? ""}
          limit={CLIP_PROMPT_LIMIT}
          placeholder="Direction for this clip only"
          commit={(text) =>
            command({ op: "set-clip-prompt", layerId: l.id, text })
          }
        />
        <ClipSendStatus
          projectId={project.id}
          layerId={l.id}
          prompt={l.prompt ?? ""}
        />
        {l.directions && (
          <p className="dir-hint">Directions: {directionWords(l.directions)}</p>
        )}
        <div className="dir-fields">
          {num(
            "Start frame",
            l.startFrame,
            (n) => edit({ startFrame: n }),
            0,
            project.composition.durationFrames - 1,
          )}
          {num(
            "Duration frames",
            l.durationFrames,
            (n) => edit({ durationFrames: n }),
            1,
            project.composition.durationFrames,
          )}
        </div>
        <p className="dir-hint">
          {(l.startFrame / project.composition.fps).toFixed(2)}s →{" "}
          {(
            (l.startFrame + l.durationFrames) /
            project.composition.fps
          ).toFixed(2)}
          s
        </p>
        {"sourceStartFrame" in l &&
          num(
            "Source offset",
            l.sourceStartFrame,
            (n) => edit({ sourceStartFrame: n }),
            0,
          )}
        {"gain" in l &&
          num("Gain", l.gain, (n) => edit({ gain: n }), 0, 2, 0.05)}
        {"opacity" in l && (
          <>
            <div className="dir-fields">
              {num("X", l.position.x, (n) =>
                edit({ position: { ...l.position, x: n } }),
              )}
              {num("Y", l.position.y, (n) =>
                edit({ position: { ...l.position, y: n } }),
              )}
            </div>
            <div className="dir-fields">
              {num("Scale", l.scale, (n) => edit({ scale: n }), 0.01, 10, 0.05)}
              {num(
                "Opacity",
                l.opacity,
                (n) => edit({ opacity: n }),
                0,
                1,
                0.05,
              )}
            </div>
            {num(
              "Rotation",
              l.rotationDegrees,
              (n) => edit({ rotationDegrees: n }),
              -360,
              360,
            )}
            <label className="dir-check">
              <input
                type="checkbox"
                checked={Boolean(l.motion)}
                onChange={(e) =>
                  edit({
                    motion: e.target.checked
                      ? {
                          scaleTo: l.scale * 1.1,
                          xTo: l.position.x,
                          yTo: l.position.y,
                          opacityTo: l.opacity,
                        }
                      : undefined,
                  })
                }
              />{" "}
              Animate placement
            </label>
            {l.motion && (
              <div className="dir-fields">
                {num(
                  "End scale",
                  l.motion.scaleTo,
                  (n) => edit({ motion: { ...l.motion!, scaleTo: n } }),
                  0.01,
                  10,
                  0.05,
                )}
                {num(
                  "End opacity",
                  l.motion.opacityTo,
                  (n) => edit({ motion: { ...l.motion!, opacityTo: n } }),
                  0,
                  1,
                  0.05,
                )}
                {num("End X", l.motion.xTo, (n) =>
                  edit({ motion: { ...l.motion!, xTo: n } }),
                )}
                {num("End Y", l.motion.yTo, (n) =>
                  edit({ motion: { ...l.motion!, yTo: n } }),
                )}
              </div>
            )}
          </>
        )}
        {"parameters" in l && (
          <section className="dir-parameters">
            <h3>Recipe controls</h3>
            <FontNotice
              parameters={l.parameters}
              schema={project.modules[l.moduleId].parameterSchema}
            />
            {Object.entries(l.parameters).map(([key, value]) => {
              const schema =
                project.modules[l.moduleId].parameterSchema.properties?.[key];
              const update = (v: string | number | boolean) =>
                edit({ parameters: { ...l.parameters, [key]: v } });
              return typeof value === "number" ? (
                num(
                  key,
                  value,
                  update,
                  schema?.minimum,
                  schema?.maximum,
                  schema?.type === "integer" ? 1 : 0.05,
                )
              ) : typeof value === "string" && schema?.enum ? (
                <SelectMenu
                  key={key}
                  id={`recipe-${l.id}-${key}`}
                  label={key}
                  value={value}
                  onChange={update}
                  options={schema.enum.map((v) => ({ value: v, label: v }))}
                  compact
                />
              ) : typeof value === "string" ? (
                <label key={key}>
                  {key}
                  <input
                    aria-label={key}
                    type={
                      key === "color" || schema?.pattern === HEX
                        ? "color"
                        : "text"
                    }
                    key={String(value)}
                    defaultValue={value}
                    onBlur={(e) => update(e.target.value)}
                  />
                </label>
              ) : (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => update(e.target.checked)}
                  />
                  {key}
                </label>
              );
            })}
          </section>
        )}
        <div className="dir-actions">
          <button onClick={() => reorder(1)}>Move up</button>
          <button onClick={() => reorder(-1)}>Move down</button>
          {"assetId" in l && <button onClick={replace}>Replace source</button>}
          <button onClick={remove}>Remove</button>
        </div>
      </fieldset>
      <button disabled={disabled} onClick={duplicate}>
        Duplicate layer
      </button>
      <p className="dir-hint">
        {l.locked
          ? "Locked: timing, placement and parameters are protected."
          : "Drag the clip to move it. Drag its edges to trim. Arrow keys nudge by the selected snap."}
      </p>
    </aside>
  );
}
