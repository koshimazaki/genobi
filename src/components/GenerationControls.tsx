import { useSettingsStore } from "../settings-store";
import { isDeployModel } from "../../shared/comfy/deploy-catalogue";
import { deployGeometry } from "../../shared/comfy/deploy-workflows";
import { useEffect, useRef, useState } from "react";
import type {
  AspectRatio,
  Generator,
  VideoModel,
  VideoResolution,
} from "../../shared/types";
import Icon from "./Icon";
import SelectMenu, { type SelectOption } from "./SelectMenu";
import type { FrameLock } from "../review";
import TickFader from "./TickFader";
import AspectRatioIcon from "./AspectRatioIcon";
import {
  acousticSwitch,
  entriesFor,
  entryFor,
  entryLabel,
  type Family,
  type MenuFilter,
} from "../../shared/registry";
import type { VideoControls } from "../../shared/controls";
import { isLtx, ltxResolution } from "../../shared/comfy/ltx";
import { ltxFrames, ltxWorkflowSize } from "../../shared/comfy/ltx-frame";
import { h3RouterResolution, isH3Router } from "../../shared/comfy/h3-router";
import { isH3 } from "../../shared/h3";
import { h3OmniFixed } from "../../shared/h3-hint";

interface Props {
  generator: Generator;
  model: VideoModel;
  duration: number;
  onDurationChange: (duration: number) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  resolution: VideoResolution;
  onResolutionChange: (resolution: VideoResolution) => void;
  cameraEnabled: boolean;
  onCameraEnabledChange: (enabled: boolean) => void;
  draft: boolean;
  onDraftChange: (draft: boolean) => void;
  /**
   * The ACOUSTIC SPACE switch: on moves to the AKUSPACE workflow, off back to
   * LTX-2.5 Fast. Its state is the held entry; see `acousticSwitch`.
   */
  onAcousticChange?: (on: boolean) => void;
  /**
   * Fast: the ratio and resolution the Output target sets, shown in place of
   * the composer's own and locked, so the row says what will be made.
   */
  frameLock?: FrameLock | null;
}

/** The switch's title: what the label stands for, and where it runs. */
export const ACOUSTIC_TITLE =
  "Spatially aware audio: the AKUSPACE LoRA on LTX-2.5, an open workflow via Comfy Cloud (API v2).";

/**
 * The Model menu's rows: the selected family's entries, straight from
 * `shared/registry.ts`. A `coming` row is shown disabled with its note as the
 * title and a "soon" tag, so the menu says what is on the way without offering
 * something the studio cannot run; a row the composer cannot send is disabled
 * the same way, its note naming where it runs.
 */
export function modelOptions(
  family: Family,
  openOnly: boolean,
  hosted = false,
  keep?: MenuFilter["keep"],
  deploymentRegistered = false,
) {
  return entriesFor(family, {
    openOnly,
    hosted,
    keep,
    deploymentRegistered,
  }).map((entry): SelectOption => ({
    value: entry.id,
    label: entryLabel(entry),
    icon: (
      <Icon
        name={
          entry.status !== "ready"
            ? "camera"
            : entry.generator === "image" || entry.generator === "edit"
              ? "image"
              : entry.generator === "upscale"
                ? "expand"
                : entry.generator === "audio"
                  ? "sound"
                  : entry.controls.kind === "video" && entry.controls.acoustic
                    ? "acoustic"
                    : "camera"
        }
        size={13}
      />
    ),
    ...(entry.status === "coming" && {
      disabled: true,
      note: entry.note,
      tag: "soon",
    }),
    // A row the composer cannot send says where it runs instead.
    ...(entry.status === "ready" &&
      entry.outsideComposer && {
        disabled: true,
        note: entry.outsideComposer,
        tag: "agent",
      }),
  }));
}

/**
 * The held entry's own controls alongside the combined family/model selector:
 * duration, ratio, resolution, draft where the entry has it, camera, and
 * ACOUSTIC SPACE on the two entries it moves between. The upscale entry has
 * none here; `UpscaleControls` occupies the same toolbar region instead.
 */
export default function GenerationControls({
  generator,
  model,
  duration,
  onDurationChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  draft,
  onDraftChange,
  cameraEnabled,
  onCameraEnabledChange,
  onAcousticChange = () => {},
  frameLock,
}: Props) {
  const workflow = useSettingsStore((s) => s.workflows[model]);
  const selected = entryFor(generator, model);
  const acoustic = acousticSwitch(selected);
  // The row is the held entry's controls: what it shows and what each offers.
  // The composer reducer has already moved any value the entry cannot take.
  const controls = selected.controls;
  // A song has a length and nothing else here; caption and lyrics sit above.
  if (controls.kind === "audio")
    return (
      <div className="generation-controls generation-controls--entry">
        <DurationControl
          range={controls.duration}
          value={duration}
          onChange={onDurationChange}
          label="Max"
          faderLabel="Max length"
          ceiling
          detail="A ceiling, not the length: the model ends the song when it chooses, often well before this."
        />
      </div>
    );
  if (controls.kind !== "video") return null;
  const ltx = isLtx(model);
  const native = (ltx || isDeployModel(model)) && selected.route === "workflow";
  const frameDetail = native
    ? `${ltxFrames(duration)} frames at 24 fps · 8n+1 · ${(ltxFrames(duration) / 24).toFixed(2)}s encoded`
    : ltx
      ? "25 fps · the LTX API aligns the frame count internally"
      : isH3(model)
        ? h3OmniFixed()
        : undefined;
  return (
    <div className="generation-controls generation-controls--entry">
      <DurationControl
        range={controls.duration}
        value={duration}
        onChange={onDurationChange}
        frames={native ? ltxFrames(duration) : undefined}
        detail={frameDetail}
      />
      <div className="generation-controls__aspect" title={frameLock?.note}>
        <SelectMenu
          id="aspect-ratio"
          label="Aspect ratio"
          value={frameLock?.aspectRatio ?? aspectRatio}
          compact
          disabled={Boolean(frameLock)}
          options={controls.aspectRatios.map((value) => ({
            value,
            label: value,
            icon: <AspectRatioIcon ratio={value} />,
          }))}
          onChange={(value) => onAspectRatioChange(value as AspectRatio)}
        />
      </div>
      <div
        className="generation-controls__resolution"
        title={
          frameLock?.note ??
          (draft
            ? "Draft uses HD. Turn it off to restore your selected resolution."
            : undefined)
        }
      >
        <SelectMenu
          id="resolution"
          label="Resolution"
          value={frameLock?.resolution ?? (draft ? "hd" : resolution)}
          compact
          disabled={draft || Boolean(frameLock)}
          options={controls.resolutions.map((value) => ({
            value,
            label: isDeployModel(model)
              ? deployGeometry(model, workflow)
              : ltx
                ? native
                  ? Object.values(ltxWorkflowSize(aspectRatio, value)).join(
                      " × ",
                    )
                  : ltxResolution(aspectRatio, value).replace("x", " × ")
                : isH3Router(model)
                  ? h3RouterResolution(value)
                  : value === "fhd"
                    ? "Full HD"
                    : value.toUpperCase(),
          }))}
          onChange={(value) => onResolutionChange(value as VideoResolution)}
        />
        {(frameLock || draft) && (
          <span className="sr-only">
            {frameLock
              ? frameLock.note
              : "Draft uses HD. Your preferred resolution is retained."}
          </span>
        )}
      </div>
      {controls.draft && (
        <Switch id="draft" label="Draft" on={draft} onChange={onDraftChange} />
      )}
      {controls.camera && (
        <Switch
          id="camera"
          label="Camera"
          on={cameraEnabled}
          onChange={onCameraEnabledChange}
        />
      )}
      {acoustic && (
        <Switch
          id="acoustic"
          label="Acoustic space"
          title={ACOUSTIC_TITLE}
          on={acoustic.on}
          onChange={onAcousticChange}
        />
      )}
    </div>
  );
}

/** An On/Off instrument field; Draft, Camera and Acoustic space share it. */
export function Switch({
  id,
  label,
  title,
  on,
  onChange,
}: {
  id: string;
  label: string;
  title?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div
      className={`instrument-field generation-controls__${id}`}
      title={title}
    >
      <span id={`${id}-label`} className="instrument-label">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        className="instrument-trigger draft-trigger"
        onClick={() => onChange(!on)}
      >
        <span>{on ? "On" : "Off"}</span>
        <span className="draft-trigger__track" aria-hidden="true">
          <i />
        </span>
      </button>
    </div>
  );
}

/**
 * Duration as the entry offers it: FLUX's fader runs second by second; a list
 * of choices (LTX's Router seconds) runs the same fader over the list, so it
 * can only land on a duration the model takes.
 */
function DurationControl({
  range,
  value,
  onChange,
  frames,
  detail,
  label = "Duration",
  faderLabel = label,
  ceiling = false,
}: {
  range: VideoControls["duration"];
  value: number;
  onChange: (value: number) => void;
  frames?: number;
  detail?: string;
  /**
   * A song's value is only the most it may run, so it reads "≤". The trigger
   * keeps the field's fixed width (a short label and value); the longer
   * wording lives in the popover's fader label and its detail.
   */
  label?: string;
  faderLabel?: string;
  ceiling?: boolean;
}) {
  const shown = `${ceiling ? "≤" : ""}${value}s`;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      ref={root}
      className="instrument-field generation-controls__duration"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id="duration-label" className="instrument-label">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        className="instrument-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "duration-panel" : undefined}
        aria-labelledby="duration-label duration-value"
        title={detail}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!open && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span id="duration-value">
          {shown}
          {frames ? ` · ${frames}f` : ""}
        </span>
        <Icon name="chevron" size={11} />
      </button>
      {open && (
        <div
          ref={panel}
          id="duration-panel"
          role="dialog"
          aria-labelledby="duration-label"
          className="instrument-popover duration-popover"
        >
          {"choices" in range ? (
            <TickFader
              id="duration-fader"
              label={faderLabel}
              value={Math.max(0, range.choices.indexOf(value))}
              min={0}
              max={range.choices.length - 1}
              step={1}
              limits={[range.choices[0], range.choices.at(-1)!]}
              valueLabel={shown}
              onChange={(index) => onChange(range.choices[index])}
            />
          ) : (
            <TickFader
              id="duration-fader"
              label={faderLabel}
              value={value}
              min={range.min}
              max={range.max}
              step={1}
              valueLabel={shown}
              onChange={onChange}
            />
          )}
          {detail && <p className="duration-frame-detail">{detail}</p>}
        </div>
      )}
    </div>
  );
}
