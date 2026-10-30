import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  acousticText,
  acousticLabel,
  ACOUSTIC_TEXT_LIMIT,
  acousticPreset,
  acousticSections,
  AKUSPACE_WORKFLOWS_URL,
  chooseAcoustic,
  levelLabel,
  type AcousticLevel,
  type AcousticSetting,
} from "../../shared/acoustic";
import AcousticGlyph from "./AcousticGlyph";
import Icon from "./Icon";
import PromptField from "./PromptField";
import { openModal } from "./useModalDialog";
import { lazyReload } from "../lazy-reload";
const AcousticPreview = lazyReload(() => import("../scene/AcousticPreview"));

export default function AcousticDialog({
  selected,
  onApply,
  onClose,
}: {
  selected: AcousticSetting | null;
  onApply: (setting: AcousticSetting | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [replay, setReplay] = useState(0);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      acousticSections.findIndex((section) => section.id === selected?.mode),
    ),
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const close = openModal(dialog.current);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      close();
    };
  }, []);
  const section = acousticSections[activeIndex];
  const inSection = draft?.mode === section.id ? draft : null;
  const count = acousticSections.length;
  return (
    <dialog
      ref={dialog}
      className="camera-dialog acoustic-dialog"
      aria-labelledby="acoustic-heading"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <div>
          <h2 id="acoustic-heading">Acoustic space</h2>
          <p>
            Where the sound is heard. The AKUSPACE LoRA on LTX-2.5; None runs
            LTX-2.5 Fast without it.
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Cancel acoustic changes"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="camera-dialog-body">
        <div className="acoustic-layout">
          <section className="acoustic-panel" aria-label="Acoustic space">
            <div
              className="camera-tabs"
              role="tablist"
              aria-label="Acoustic sections"
              style={
                {
                  "--active-tab": activeIndex,
                  "--section-color": "var(--acoustic)",
                } as CSSProperties
              }
            >
              <span className="camera-tab-indicator" aria-hidden="true" />
              {acousticSections.map((item, index) => {
                const choice =
                  draft?.mode === item.id ? acousticPreset(draft.preset) : null;
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`acoustic-tab-${item.id}`}
                    aria-controls={
                      activeIndex === index
                        ? `acoustic-panel-${item.id}`
                        : undefined
                    }
                    aria-label={`${item.label}: ${choice?.label ?? "None"}`}
                    aria-selected={activeIndex === index}
                    tabIndex={activeIndex === index ? 0 : -1}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => {
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % count
                          : event.key === "ArrowLeft"
                            ? (index + count - 1) % count
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? count - 1
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        setActiveIndex(next);
                        tabs.current[next]?.focus();
                      }
                    }}
                  >
                    <span className="camera-tab-label">
                      <span>{item.label}</span>
                      <strong className={choice ? undefined : "is-none"}>
                        {choice?.short_label ?? "None"}
                      </strong>
                    </span>
                    <span
                      className={`camera-tab-choice ${choice ? "has-choice" : ""}`}
                      aria-hidden="true"
                    >
                      {choice ? <AcousticGlyph preset={draft!.preset} /> : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              key={section.id}
              className="camera-tab-panel"
              role="tabpanel"
              id={`acoustic-panel-${section.id}`}
              aria-labelledby={`acoustic-tab-${section.id}`}
            >
              <div
                className="acoustic-preset-grid"
                role="group"
                aria-label={section.label}
              >
                {section.presets.map((key) => {
                  const preset = acousticPreset(key);
                  const chosen = inSection?.preset === key;
                  return (
                    <button
                      key={key}
                      className={`preset ${chosen ? "selected" : ""}`}
                      aria-pressed={chosen}
                      title={preset.description}
                      onClick={() =>
                        setDraft(chooseAcoustic(section, key, draft))
                      }
                    >
                      <AcousticGlyph preset={key} />
                      <span>{preset.label}</span>
                      <i className="selection-dot" />
                    </button>
                  );
                })}
              </div>
              <div
                className="acoustic-levels"
                role="group"
                aria-label={`${section.label} level`}
              >
                <span className="instrument-label">Level</span>
                {section.levels.map((level) => (
                  <button
                    key={level}
                    className={`acoustic-level ${inSection?.level === level ? "selected" : ""}`}
                    aria-pressed={inSection?.level === level}
                    disabled={!inSection}
                    onClick={() =>
                      inSection &&
                      setDraft({ ...inSection, level: level as AcousticLevel })
                    }
                  >
                    {levelLabel(level)}
                  </button>
                ))}
              </div>
              <div className="camera-grid-footer">
                <a
                  href={AKUSPACE_WORKFLOWS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AKUSPACE workflows"
                >
                  AKUSPACE workflows <Icon name="arrow" size={10} />
                </a>
                <button
                  className={`camera-none ${draft === null ? "selected" : ""}`}
                  aria-pressed={draft === null}
                  onClick={() => setDraft(null)}
                >
                  None
                </button>
              </div>
            </div>
          </section>
          <div className="camera-preview-column">
            <div className="preview-wrap">
              <Suspense
                fallback={
                  <div className="preview-fallback">Preparing the space…</div>
                }
              >
                <AcousticPreview setting={draft} replay={replay} />
              </Suspense>
              <div className="preview-caption">
                <div>
                  <span className="section-eyebrow">ACOUSTIC PREVIEW</span>
                  <strong>
                    {draft ? acousticLabel(draft) : "None · dry sound"}
                  </strong>
                </div>
                <button
                  className="icon-button"
                  aria-label="Replay acoustic preview"
                  onClick={() => setReplay((v) => v + 1)}
                >
                  <Icon name="refresh" size={15} />
                </button>
              </div>
              <span className="preview-disclaimer">
                Illustrative guide · not an acoustic simulation
              </span>
            </div>
          </div>
        </div>
        {draft && (
          <div
            className="camera-phrases acoustic-phrases"
            role="group"
            aria-label="Acoustic prompt"
          >
            <div className="camera-phrase-line acoustic-phrase-line">
              <span className="camera-phrase-label">AKUSPACE</span>
              <PromptField
                id="acoustic-text"
                label="Acoustic wording"
                value={acousticText(draft)}
                maxLength={ACOUSTIC_TEXT_LIMIT}
                placeholder="Describe the acoustic treatment…"
                onChange={(text) => setDraft({ ...draft, text })}
              />
            </div>
            <p className="acoustic-edit-note">
              AKUSPACE stays in the prompt. Custom wording stays when you change
              presets; the preview illustrates the selected preset.
            </p>
            <button
              className="text-button"
              onClick={() => {
                const { text: _text, ...preset } = draft;
                setDraft(preset);
              }}
            >
              Reset to preset wording
            </button>
          </div>
        )}
      </div>
      <div className="camera-dialog-actions">
        <button className="text-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!!draft && !acousticText(draft).trim()}
          onClick={() => onApply(draft)}
        >
          Done <Icon name="arrow" size={16} />
        </button>
      </div>
    </dialog>
  );
}
