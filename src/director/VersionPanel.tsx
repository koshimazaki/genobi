import { useRef, useState } from "react";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import { versionSlots } from "../../shared/templates/version";
import { SUBJECT_LIMIT, TITLE_LIMIT } from "../../shared/templates/plan";
import { useModalDialog } from "../components/useModalDialog";
import { studioStore } from "../studio/store";
import {
  applyVersionInputs,
  importVersionFiles,
  versionPicks,
  versionTextInputs,
} from "./version-inputs";
import { saveBundle, type Bundle } from "./bundle";
import VersionInputSlot, { VersionPreview } from "./VersionInputSlot";
import { writeBrief } from "./prompt-brief";
import { readVersionBrief } from "./version-brief";
import { ApprovalWaitingNotice } from "../agent/ApprovalWaitingNotice";

/**
 * Make my version (#57, swap only): a finished template keeps its timeline,
 * effects and soundtrack, and the person swaps media into its slots. Every
 * action here is a local, undoable edit. Nothing starts an agent, a quote or
 * a GPU job; new media is made in Camera (each slot's Recreate / Create in
 * Camera) and comes back through Assets → Generated.
 */
export default function VersionPanel({
  template,
  initial,
  close,
}: {
  template: HouseTemplate;
  initial: Bundle;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog);
  const [draft, setDraft] = useState(initial);
  const [base, setBase] = useState(initial);
  const [picks, setPicks] = useState(() => versionPicks(initial, template));
  const [defaults] = useState(picks);
  const [inputs, setInputs] = useState<TemplateInputs>(() =>
    versionTextInputs(initial, template),
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  async function apply() {
    const before = studioStore.getState();
    if (
      before.director.bundle !== base ||
      Object.values(before.operations).some(Boolean)
    )
      throw new Error(
        "Project changed or is busy. Close and reopen this panel to review the latest inputs.",
      );
    const next = await applyVersionInputs(draft, template, picks, inputs);
    const current = studioStore.getState();
    if (
      current.director.bundle !== base ||
      Object.values(current.operations).some(Boolean)
    )
      throw new Error(
        "Project changed while validating. Your timeline is kept.",
      );
    current.actions.commit(next, base);
    const committed = studioStore.getState().director.bundle!;
    setBase(committed);
    setDraft(committed);
    return committed;
  }
  return (
    <dialog
      ref={dialog}
      className="dir-version-panel"
      aria-label="Make my version"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header>
        <div>
          <p className="dir-eyebrow">{template.name}</p>
          <h2>Make my version</h2>
        </div>
        <button
          onClick={close}
          disabled={working}
          aria-label="Close Make my version"
        >
          Close
        </button>
      </header>
      <ApprovalWaitingNotice />
      <p>
        Swap your media into the slots below. The cut, effects and soundtrack
        stay as they are, and Undo restores the original. Nothing is generated
        here: new media is made in Camera and shows up in Assets → Generated.
      </p>
      <section className="dir-version-inputs" aria-label="Template inputs">
        <fieldset className="dir-version-words" disabled={working}>
          <legend>Words</legend>
          {(["subject", "title"] as const).map((key) => (
            <label key={key}>
              {template.inputs[key].label}
              <input
                value={inputs[key]}
                maxLength={key === "subject" ? SUBJECT_LIMIT : TITLE_LIMIT}
                onChange={(e) =>
                  setInputs({ ...inputs, [key]: e.target.value })
                }
              />
              <small>{template.inputs[key].hint}</small>
            </label>
          ))}
        </fieldset>
        {versionSlots(template).map((slot) => (
          <VersionInputSlot
            key={slot.id}
            slot={slot}
            bundle={draft}
            ids={picks[slot.id] ?? []}
            defaults={defaults[slot.id] ?? []}
            disabled={working}
            beforeCamera={close}
            pick={(ids) => setPicks((old) => ({ ...old, [slot.id]: ids }))}
            upload={(files) =>
              act(async () => {
                const imported = await importVersionFiles(draft, slot, files);
                setDraft(imported.bundle);
                setPicks((old) => ({ ...old, [slot.id]: imported.assetIds }));
              })
            }
          />
        ))}
      </section>
      <details className="dir-version-advanced">
        <summary>Advanced · description and references</summary>
        <section className="dir-version-brief" aria-label="Make it yours brief">
          <label>
            Your description and reference bindings
            <textarea
              aria-label="Make it yours description"
              value={readVersionBrief(draft).text}
              maxLength={12000}
              disabled={working}
              onChange={(e) =>
                setDraft(
                  writeBrief(draft, {
                    ...readVersionBrief(draft),
                    text: e.target.value,
                  }),
                )
              }
            />
          </label>
          <VersionPreview
            bundle={draft}
            ids={readVersionBrief(draft).references.flatMap((r) =>
              r.assetId ? [r.assetId] : [],
            )}
          />
          <small>
            Character, style, font and other references stay bound to your saved
            description. Edit their bindings in Make it yours.
          </small>
        </section>
      </details>
      <footer>
        <button
          disabled={working}
          onClick={() =>
            void act(async () => {
              await saveBundle(await apply());
            })
          }
        >
          Save project ZIP
        </button>
        <button
          disabled={working}
          onClick={() =>
            void act(async () => {
              await apply();
              setNotice(
                "Asset swaps applied · Undo restores your previous inputs. Nothing was generated.",
              );
            })
          }
        >
          Apply swaps
        </button>
        <button
          className="dir-primary"
          disabled={working}
          onClick={() =>
            void act(async () => {
              await apply();
              close();
            })
          }
        >
          Apply swaps and continue editing
        </button>
      </footer>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </dialog>
  );
}
