import { Fragment, Suspense, useState, type CSSProperties } from "react";
import {
  cameraSections,
  cameraClauses,
  cameraLabel,
  cameraGuide,
  guideSectionUrl,
  termExample,
  termName,
  termsFor,
  type CameraSelection,
  type CameraTermId,
} from "../../shared/camera";
import type { VideoModel } from "../../shared/types";
import CameraGlyph from "./CameraGlyph";
import LightPicker from "./LightPicker";
import type { LightSelection } from "../../shared/light";
import Icon from "./Icon";
import { lazyReload } from "../lazy-reload";
const CameraPreview = lazyReload(() => import("../scene/CameraPreview"));
export default function CameraPanelExpanded({
  selected,
  onSelect,
  model = "flux-3",
  still = false,
  light,
  onLight,
}: {
  selected: CameraSelection;
  onSelect: (selection: CameraSelection) => void;
  model?: VideoModel;
  /** A still: shot size and angle only. */
  still?: boolean;
  /** LTX video: the Light picker, between Angles and Movements. */
  light?: LightSelection;
  onLight?: (light: LightSelection) => void;
}) {
  const guide = cameraGuide(model);
  const [replay, setReplay] = useState(0);
  const [exampleId, setExampleId] = useState<CameraTermId>("orbit");
  const active = cameraClauses(selected, {}, model);
  const example =
    active.find(({ term }) => term.id === exampleId) ?? active.at(-1);
  return (
    <section className="camera-panel" aria-label="Camera direction">
      <div className="camera-choices">
        {cameraSections
          .filter((section) => !still || section.id !== "movements")
          .map((section) => (
            <Fragment key={section.id}>
              {section.id === "movements" && light && onLight && (
                <div
                  className="camera-section"
                  style={
                    {
                      "--section-color": "var(--camera-light)",
                    } as CSSProperties
                  }
                >
                  <div className="section-eyebrow">
                    <span>Light</span>
                    <span>one per group</span>
                  </div>
                  <LightPicker selected={light} onSelect={onLight} />
                </div>
              )}
              <div
                className="camera-section"
                style={
                  {
                    "--section-color": `var(${section.color})`,
                  } as CSSProperties
                }
              >
                <div className="section-eyebrow">
                  <a
                    href={guideSectionUrl(section, model)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {section.label} <Icon name="arrow" size={10} />
                  </a>
                  <span>
                    {termsFor(section, model).length} terms · choose one
                  </span>
                </div>
                <div
                  className="preset-row"
                  role="group"
                  aria-label={section.label}
                >
                  <button
                    className={`preset preset-none ${selected[section.id] === null ? "selected" : ""}`}
                    aria-pressed={selected[section.id] === null}
                    onClick={() =>
                      onSelect({ ...selected, [section.id]: null })
                    }
                  >
                    <span aria-hidden="true">—</span>
                    <span>None</span>
                  </button>
                  {termsFor(section, model).map((term) => (
                    <button
                      key={term.id}
                      className={`preset ${selected[section.id] === term.id ? "selected" : ""}`}
                      aria-pressed={selected[section.id] === term.id}
                      title={term.description}
                      onClick={() => {
                        onSelect({ ...selected, [section.id]: term.id });
                        setExampleId(term.id);
                        setReplay((v) => v + 1);
                      }}
                    >
                      <CameraGlyph section={section} term={term} />
                      <span>{termName(term, model)}</span>
                      <i className="selection-dot" />
                    </button>
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
        <p className="camera-note">
          <a href={guide.url} target="_blank" rel="noopener noreferrer">
            {guide.note} <Icon name="arrow" size={10} />
          </a>
        </p>
      </div>
      <div className="camera-preview-column">
        <div className="preview-wrap">
          <Suspense
            fallback={
              <div className="preview-fallback">Preparing the camera…</div>
            }
          >
            <CameraPreview selection={selected} model={model} replay={replay} />
          </Suspense>
          <div className="preview-caption">
            <div>
              <span className="section-eyebrow">COMBINED PREVIEW</span>
              <strong>{cameraLabel(selected, model)}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="Replay camera preview"
              onClick={() => setReplay((v) => v + 1)}
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
          <span className="preview-disclaimer">
            Motion guide · results may vary
          </span>
        </div>
        {example && (
          <details className="camera-example">
            <summary>{termName(example.term, model)} · example</summary>
            <p>{example.term.description}</p>
            <p>{termExample(example.term, model)}</p>
            <a
              href={guideSectionUrl(example.section, model)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Studio example · see the {guide.name} ↗
            </a>
          </details>
        )}
      </div>
    </section>
  );
}
