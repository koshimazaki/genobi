import { useMemo, useState } from "react";
import {
  createEffectVariant,
  effectParameters,
  inspectEffectPreset,
  type EffectVariant,
} from "../../shared/effects";
import { studioStore } from "../studio/store";
import { useStudio } from "../studio/useStudio";
import { executeStudioCommand } from "../studio/commands";
import { useShell } from "../studio/ShellContext";
import { EffectControls } from "./EffectControls";
import { EffectPreview } from "./EffectPreview";
import { downloadVariant } from "./variant-store";
import { effectInsertionCommand } from "./insertion-command";
import "./effects.css";

export function EffectPresetEditor({
  presetId,
  variant,
  source,
  onSave,
  onRemove,
}: {
  presetId: string;
  variant?: EffectVariant;
  source?: HTMLCanvasElement;
  onSave: (variant: EffectVariant) => boolean;
  onRemove?: () => void;
}) {
  const preset = useMemo(() => inspectEffectPreset(presetId), [presetId]);
  const [parameters, setParameters] = useState(() =>
    effectParameters(preset, variant?.parameters),
  );
  const [name, setName] = useState(variant?.name ?? `${preset.name} variation`);
  const [seconds, setSeconds] = useState(preset.durationSeconds);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inserting, setInserting] = useState(false);
  const bundle = useStudio((s) => s.director.bundle);
  const frame = useStudio((s) => s.transport.frame);
  const operations = useStudio((s) => s.operations);
  const shell = useShell();
  const busy = inserting || Object.values(operations).some(Boolean);
  async function insert() {
    setMessage("");
    setError("");
    const state = studioStore.getState(),
      project = state.director.bundle?.project;
    if (!project)
      return setError("Open an Editor project before inserting this effect.");
    setInserting(true);
    try {
      await executeStudioCommand(
        effectInsertionCommand(project, {
          presetId: preset.id,
          instanceId: `effect-${crypto.randomUUID()}`,
          frame: state.transport.frame,
          seconds,
          parameters,
          selectedId: state.workspace.selected,
        }),
      );
      setMessage(
        `Added ${preset.layers.length === 1 ? "one editable layer" : `${preset.layers.length} editable layers`} to ${project.name}. Undo removes this insertion in one step.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInserting(false);
    }
  }
  function save(download = false) {
    setError("");
    setMessage("");
    try {
      const next = createEffectVariant(preset.id, name, parameters);
      if (download) {
        downloadVariant(next);
        setMessage(
          "Variant exported. Import it into another project or browser.",
        );
      } else
        setMessage(
          onSave(next)
            ? "Variant saved in this browser."
            : "Variant kept for this tab only. Export a copy to keep it.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section className="effect-editor" aria-label={`Configure ${preset.name}`}>
      <div className="effect-editor-visual">
        <EffectPreview
          preset={preset}
          parameters={parameters}
          source={source}
        />
        <p className="effect-note">{preset.note}</p>
        <div className="effect-tags">
          <span>
            {preset.layers.length} editable{" "}
            {preset.layers.length === 1 ? "layer" : "layers"}
          </span>
          <span>v{preset.version}</span>
          <span>Local rendering</span>
        </div>
      </div>
      <div className="effect-editor-settings">
        <header>
          <div>
            <small>{preset.family}</small>
            <h3>{variant?.name ?? preset.name}</h3>
          </div>
          <button
            type="button"
            onClick={() => setParameters({ ...preset.defaults })}
          >
            Reset
          </button>
        </header>
        <p>{preset.description}</p>
        <EffectControls
          preset={preset}
          parameters={parameters}
          change={(key, value) =>
            setParameters((p) => ({ ...p, [key]: value }))
          }
        />
        <div className="effect-insert-row">
          <label>
            Duration{" "}
            <span>
              <input
                aria-label="Effect duration in seconds"
                type="number"
                min={0.05}
                max={120}
                step={0.25}
                value={seconds}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0 && n <= 120) setSeconds(n);
                }}
              />{" "}
              s
            </span>
          </label>
          <button
            type="button"
            className="effect-primary"
            disabled={!bundle || busy}
            onClick={() => void insert()}
          >
            {inserting ? "Inserting…" : "Insert in Editor"}
          </button>
        </div>
        <p className="effect-target">
          {bundle
            ? `${bundle.project.name} · at ${(frame / bundle.project.composition.fps).toFixed(2)} s. Fits the remaining composition.`
            : "Open a project in Director or Editor to insert this preset."}{" "}
          {preset.input !== "none" &&
            "Treats the picture below the effect layers."}
        </p>
        <details className="effect-save">
          <summary>Save a variant</summary>
          <div>
            <input
              aria-label="Effect variant name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => save()}
            >
              Save variant
            </button>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => save(true)}
            >
              Export JSON
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove}>
                Remove saved variant
              </button>
            )}
          </div>
        </details>
        {message && (
          <p role="status" className="effect-message">
            {message}{" "}
            {shell && (
              <button type="button" onClick={() => shell.select("editor")}>
                Open Editor
              </button>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="effect-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
