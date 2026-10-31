import { useShell } from "../studio/ShellContext";
import { versionRequestedSlots, versionStudioUrl } from "./version-handoff";
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
import type { useAgentSend } from "./useAgentSend";
import VersionInputSlot, { VersionPreview } from "./VersionInputSlot";
import { writeBrief } from "./prompt-brief";
import VersionPlan from "./VersionPlan";
import { versionInstruction } from "./version-instruction";
import { readVersionBrief } from "./version-brief";

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
  const shell = useShell();
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog);
  const [draft, setDraft] = useState(initial);
  const [base, setBase] = useState(initial);
  const [picks, setPicks] = useState(() => versionPicks(initial, template));
  const [defaults] = useState(picks);
  const [inputs, setInputs] = useState<TemplateInputs>(() =>
    versionTextInputs(initial, template),
  );
  const search = typeof window === "undefined" ? "" : window.location.search;
  const [make, setMake] = useState<string[]>(() => {
    if (new URLSearchParams(search).has("generate"))
      return versionRequestedSlots(template.id, search);
    return template.mix
      ? versionSlots(template)
          .filter(
            (slot) =>
              slot.kind === "video" &&
              (picks[slot.id] ?? []).every(
                (id) =>
                  !["uploaded", "generated"].includes(
                    initial.project.assets[id]?.origin,
                  ),
              ),
          )
          .map((slot) => slot.id)
      : [];
  });
  const localUrl = versionStudioUrl(
    template.id,
    shell?.preset ?? "director",
    make,
  );
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const busy = working || agent.sending || agent.working;
  // House templates still have shots to prepare. A finished mix with no
  // replacement requests can be edited entirely in the browser.
  const needsAgent = !template.mix || make.length > 0;
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
    startAgent(versionInstruction(bundle, template, make));
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
        Drop your media into the slots below, keep the originals or ask your
        agent for replacements. Paid generation waits for your approval.
      </p>
      <nav aria-label="Make my version steps" className="dir-version-steps">
        <button
          type="button"
          aria-current={!review ? "step" : undefined}
          onClick={() => setReview(false)}
          disabled={busy}
        >
          1 · Your media
        </button>
        <button
          type="button"
          aria-current={review ? "step" : undefined}
          onClick={() => setReview(true)}
          disabled={busy}
        >
          2 · Generation plan
        </button>
      </nav>
      {agent.copy === false && (
        <p className="dir-version-connection" role="status">
          {needsAgent
            ? "Generation for this project continues in your local studio. You can replace media and edit here. Save a project ZIP to bring your uploads and edits with you."
            : "You can apply these edits here. Save an editable project ZIP to keep your files and timeline."}
        </p>
      )}
      {new URLSearchParams(search).get("handoff") === "project-zip" && (
        <p className="dir-version-connection">
          This is the selected template. If you changed media or timing in the
          hosted studio, import your saved project ZIP before preparing
          generation.
        </p>
      )}
      {!review ? (
        <>
          <section className="dir-version-inputs" aria-label="Template inputs">
            <fieldset className="dir-version-words" disabled={busy}>
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
                    const imported = await importVersionFiles(
                      draft,
                      slot,
                      files,
                    );
                    setDraft(imported.bundle);
                    setPicks((old) => ({
                      ...old,
                      [slot.id]: imported.assetIds,
                    }));
                    setMake((old) => old.filter((id) => id !== slot.id));
                  })
                }
              />
            ))}
          </section>
          <details className="dir-version-advanced">
            <summary>Advanced · description and references</summary>
            <section
              className="dir-version-brief"
              aria-label="Make it yours brief"
            >
              <label>
                Your description and reference bindings
                <textarea
                  aria-label="Make it yours description"
                  value={readVersionBrief(draft).text}
                  maxLength={12000}
                  disabled={busy}
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
                Character, style, font and other references stay bound to your
                saved description. Edit their bindings in Make it yours.
              </small>
            </section>
          </details>
          <footer>
            {agent.copy === false && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await saveBundle(await apply());
                    })
                  }
                >
                  Save project ZIP
                </button>
                <a
                  className="dir-version-local"
                  href={localUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open local studio ↗
                </a>
              </>
            )}
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
          <VersionPlan
            template={template}
            bundle={draft}
            make={make}
            inputs={inputs}
            needsAgent={needsAgent}
          />
          {needsAgent && agent.copy === false && (
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
              <a href={localUrl} target="_blank" rel="noopener noreferrer">
                Open local studio ↗
              </a>
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => setReview(false)}>
              Back to inputs
            </button>
            <button
              className={needsAgent ? undefined : "dir-primary"}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await apply();
                  close();
                })
              }
            >
              Apply swaps and continue editing
            </button>
            {needsAgent && (
              <button
                className="dir-primary"
                disabled={busy || agent.copy !== true}
                onClick={() => void act(prepare)}
              >
                Prepare with Genobi · approval in bubble
              </button>
            )}
          </footer>
          {needsAgent && agent.copy === undefined && (
            <p role="status">Checking local project connection…</p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </dialog>
  );
}
