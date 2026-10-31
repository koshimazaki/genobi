import { useRef, useState } from "react";
import { versionSlots, versionTemplate } from "../../shared/templates/version";
import { studioStore } from "../studio/store";
import type { Bundle } from "./bundle";
import VersionInputSlot from "./VersionInputSlot";
import {
  applyVersionInputs,
  importVersionFiles,
  versionPicks,
  versionTextInputs,
} from "./version-inputs";
import "./version.css";

/** These are the generation panel's actual project inputs, with the same import checks. */
export default function TemplateMediaInputs({
  bundle,
  disabled,
}: {
  bundle: Bundle;
  disabled: boolean;
}) {
  const template = versionTemplate(bundle.project);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  if (!template) return null;
  const slots = versionSlots(template);
  const picks = versionPicks(bundle, template);
  async function change(id: string, assets?: string[], files?: File[]) {
    if (disabled || lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      if (Object.values(studioStore.getState().operations).some(Boolean))
        throw new Error("Wait for the current edit or render to finish.");
      const slot = slots.find((s) => s.id === id)!;
      const imported = files
        ? await importVersionFiles(bundle, slot, files)
        : undefined;
      const next = await applyVersionInputs(
        imported?.bundle ?? bundle,
        template!,
        { ...picks, [id]: imported?.assetIds ?? assets ?? [] },
        versionTextInputs(bundle, template!),
        // Missing optional/other inputs can be filled later. This never generates.
        slots.map((s) => s.id),
      );
      if (Object.values(studioStore.getState().operations).some(Boolean))
        throw new Error("Project is busy; try the replacement again.");
      studioStore.getState().actions.commit(next, bundle);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not replace this media.",
      );
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  return (
    <section
      className="dir-version-panel dir-version-inline"
      aria-label="Template media"
    >
      <h3>Your template assets</h3>
      <p>
        Preview an asset or drop a replacement. These same assets and your
        description below are used by Generate my version.
      </p>
      <div className="dir-version-inputs">
        {slots.map((slot) => (
          <VersionInputSlot
            key={slot.id}
            slot={slot}
            bundle={bundle}
            ids={picks[slot.id] ?? []}
            disabled={disabled || working}
            pick={(ids) => void change(slot.id, ids)}
            upload={(files) => change(slot.id, undefined, files)}
          />
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
