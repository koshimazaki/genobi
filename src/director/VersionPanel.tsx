import { useRef, useState } from "react";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import { versionSlots } from "../../shared/templates/version";
import { SUBJECT_LIMIT, TITLE_LIMIT } from "../../shared/templates/plan";
import { promptsInstruction } from "../../shared/director/prompt-send";
import { useModalDialog } from "../components/useModalDialog";
import { studioStore } from "../studio/store";
import {
  applyVersionInputs,
  importVersionFiles,
  versionPicks,
  versionTextInputs,
} from "./version-inputs";
import { saveBundle, type Bundle } from "./bundle";
import { feedbackOf } from "./feedback-file";
import type { useAgentSend } from "./useAgentSend";
import VersionInputSlot from "./VersionInputSlot";
import VersionPlan from "./VersionPlan";

export default function VersionPanel({
  template,
  initial,
  agent,
  close,
  startAgent,
}: {
  template: HouseTemplate;
  initial: Bundle;
  agent: ReturnType<typeof useAgentSend>;
  close: () => void;
  startAgent: (instruction: string) => void;
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
  const [make, setMake] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const busy = working || agent.sending || agent.working;
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
    const next = await applyVersionInputs(draft, template, picks, inputs, make);
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
  async function prepare() {
    const bundle = await apply();
    const choices = versionSlots(template)
      .map((slot) => {
        const ids = picks[slot.id] ?? [];
        const media = ids
          .map((id) => `${id} (${bundle.project.assets[id]?.file.path})`)
          .join(", ");
        return `${slot.label} (${slot.id}, ${slot.kind}): ${make.includes(slot.id) ? "Generate a replacement" : "Reuse current media"}; ${media || (slot.picture ? "declared template picture" : "not supplied")}. Keep the current media until approved results are ready.`;
      })
      .join("\n");
    startAgent(
      [
        `Make my version of ${template.name} on this existing linked project. Read its current revision, actual asset files, brief and generationPlans first.`,
        `My brief: ${JSON.stringify(inputs.subject)}. Title: ${JSON.stringify(inputs.title)}.`,
        choices,
        "Use my supplied assets and references. Preserve timeline timing, source in-points, graphics and other edits. For every requested new asset, inspect its clip uses and required source duration, propose a suitable model/workflow and ask for missing creative direction. Do not infer an original generation prompt from demo footage. Show each paid step's quote and total and wait for explicit approval in the studio bubble before submission; this handoff is not spending approval. Persist idempotency first and never retry an uncertain submission automatically. Place approved results with revision-checked shared project commands and preview the cut. On failure keep the current media and report why.",
        promptsInstruction(bundle.project, feedbackOf(bundle)).text,
      ].join("\n"),
    );
  }
  return (
    <dialog
      ref={dialog}
      className="dir-version-panel"
      aria-label="Generate my version"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header>
        <div>
          <p className="dir-eyebrow">{template.name}</p>
          <h2>Generate my version</h2>
        </div>
        <button
          onClick={close}
          disabled={working}
          aria-label="Close Generate my version"
        >
          Close
        </button>
      </header>
      <p>
        Choose the media to reuse or replace. Your linked agent prepares
        generation; each paid step waits for a quote and your approval in the
        bubble.
      </p>
      {!review ? (
        <>
          <fieldset disabled={busy}>
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
              disabled={busy}
              make={make.includes(slot.id)}
              generate={(yes) =>
                setMake((old) =>
                  yes
                    ? [...new Set([...old, slot.id])]
                    : old.filter((id) => id !== slot.id),
                )
              }
              pick={(ids) => setPicks((old) => ({ ...old, [slot.id]: ids }))}
              upload={(files) =>
                act(async () => {
                  const imported = await importVersionFiles(draft, slot, files);
                  setDraft(imported.bundle);
                  setPicks((old) => ({ ...old, [slot.id]: imported.assetIds }));
                  setMake((old) => old.filter((id) => id !== slot.id));
                })
              }
            />
          ))}
          <footer>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await apply();
                  setNotice(
                    "Asset swaps applied · Undo restores your previous inputs. Nothing was generated.",
                  );
                })
              }
            >
              Apply swaps only
            </button>
            <button
              className="dir-primary"
              disabled={busy}
              onClick={() => setReview(true)}
            >
              Review generation plan
            </button>
          </footer>
        </>
      ) : (
        <>
          <VersionPlan template={template} bundle={draft} make={make} />
          {agent.copy === false && (
            <p>
              To let your agent use these files, save the editable project ZIP
              and open it in your local studio. Hosted pairing alone does not
              transfer project media.{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const bundle = await apply();
                    await saveBundle(bundle);
                  })
                }
              >
                Save project ZIP
              </button>{" "}
              <a
                href="http://127.0.0.1:4317"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open local studio ↗
              </a>
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => setReview(false)}>
              Back to inputs
            </button>
            <button
              className="dir-primary"
              disabled={busy || agent.copy !== true}
              onClick={() => void act(prepare)}
            >
              Prepare with Genobi · approval in bubble
            </button>
          </footer>
          {agent.copy === undefined && (
            <p role="status">Checking local project connection…</p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </dialog>
  );
}
