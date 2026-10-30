import {
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { hasLight, lightLabel, type LightSelection } from "../../shared/light";
import LightPicker from "./LightPicker";
import {
  cameraSections,
  cameraLabel,
  cameraGuide,
  guideSectionUrl,
  termExample,
  termName,
  termsFor,
  type CameraSelection,
} from "../../shared/camera";
import type { VideoModel } from "../../shared/types";
import CameraPanelExpanded from "./CameraPanelExpanded";
import CameraPresetGrid from "./CameraPresetGrid";
import CameraGlyph from "./CameraGlyph";
import Icon from "./Icon";
import { lazyReload } from "../lazy-reload";
const CameraPreview = lazyReload(() => import("../scene/CameraPreview"));

export default function CameraPanel({
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
  /** A still: shot size and angle only; movement is video's. */
  still?: boolean;
  /** LTX video: the Light picker, a tab between Angles and Movements. */
  light?: LightSelection;
  onLight?: (light: LightSelection) => void;
}) {
  const sections = still
    ? cameraSections.filter((item) => item.id !== "movements")
    : cameraSections;
  // The LTX guide's order: shot, then light, then movement.
  const tabList: {
    id: string;
    label: string;
    color: string;
    choice: string | null;
    glyph: ReactNode;
  }[] = sections.map((item) => {
    const choice = item.terms.find((term) => term.id === selected[item.id]);
    return {
      id: item.id,
      label: item.label,
      color: item.color,
      choice: choice ? termName(choice, model) : null,
      glyph: choice ? <CameraGlyph section={item} term={choice} /> : "—",
    };
  });
  if (light && onLight && !still)
    tabList.splice(2, 0, {
      id: "light",
      label: "Light",
      color: "--camera-light",
      choice: hasLight(light) ? lightLabel(light) : null,
      glyph: hasLight(light) ? <span className="light-glyph" /> : "—",
    });
  const count = tabList.length;
  const [expanded, setExpanded] = useState(
    () =>
      new URLSearchParams(location.search).get("camera-layout") === "expanded",
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [replay, setReplay] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = tabList[Math.min(activeIndex, count - 1)];
  const section = sections.find((item) => item.id === tab.id);
  const example =
    section &&
    termsFor(section, model).find((term) => term.id === selected[section.id]);
  const guide = cameraGuide(model);
  function compare() {
    const next = !expanded;
    setExpanded(next);
    const url = new URL(location.href);
    if (next) url.searchParams.set("camera-layout", "expanded");
    else url.searchParams.delete("camera-layout");
    history.replaceState(null, "", url);
  }
  return (
    <>
      {expanded ? (
        <CameraPanelExpanded
          selected={selected}
          onSelect={onSelect}
          model={model}
          still={still}
          light={still ? undefined : light}
          onLight={onLight}
        />
      ) : (
        <section
          className="camera-panel camera-panel--tabs"
          aria-label="Camera direction"
        >
          <div className="camera-choices">
            <div
              className="camera-tabs"
              role="tablist"
              aria-label="Camera sections"
              style={
                {
                  "--active-tab": activeIndex,
                  "--tab-count": count,
                  "--section-color": `var(${tab.color})`,
                } as CSSProperties
              }
            >
              <span className="camera-tab-indicator" aria-hidden="true" />
              {tabList.map((item, index) => {
                const choice = item.choice;
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`tab-${item.id}`}
                    aria-controls={
                      activeIndex === index ? `panel-${item.id}` : undefined
                    }
                    aria-label={`${item.label}: ${choice ?? "None"}`}
                    title={`${item.label}: ${choice ?? "None"}`}
                    aria-selected={activeIndex === index}
                    tabIndex={activeIndex === index ? 0 : -1}
                    style={
                      {
                        "--section-color": `var(${item.color})`,
                      } as CSSProperties
                    }
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
                      <strong>{choice ?? "None"}</strong>
                    </span>
                    <span
                      className={`camera-tab-choice ${choice ? "has-choice" : ""}`}
                      aria-hidden="true"
                    >
                      {item.glyph}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              key={tab.id}
              className="camera-tab-panel"
              role="tabpanel"
              id={`panel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              style={
                { "--section-color": `var(${tab.color})` } as CSSProperties
              }
            >
              {section ? (
                <CameraPresetGrid
                  section={section}
                  model={model}
                  selected={selected[section.id]}
                  onSelect={(id) => {
                    onSelect({ ...selected, [section.id]: id });
                    setReplay((value) => value + 1);
                  }}
                />
              ) : (
                <LightPicker selected={light!} onSelect={onLight!} />
              )}
            </div>
          </div>
          <div className="camera-preview-column">
            <div className="preview-wrap">
              <Suspense
                fallback={
                  <div className="preview-fallback">Preparing the camera…</div>
                }
              >
                <CameraPreview
                  selection={selected}
                  model={model}
                  replay={replay}
                />
              </Suspense>
              <div className="preview-caption">
                <div>
                  <span className="section-eyebrow">COMBINED PREVIEW</span>
                  <strong>{cameraLabel(selected, model)}</strong>
                </div>
                <button
                  className="icon-button"
                  aria-label="Replay camera preview"
                  onClick={() => setReplay((value) => value + 1)}
                >
                  <Icon name="refresh" size={15} />
                </button>
              </div>
              <span className="preview-disclaimer">
                Motion guide · results may vary
              </span>
            </div>
            {example && (
              <details key={example.id} className="camera-example">
                <summary>{termName(example, model)} · example</summary>
                <p>{example.description}</p>
                <p>{termExample(example, model)}</p>
                <a
                  href={section ? guideSectionUrl(section, model) : guide.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Studio example · see the {guide.name} ↗
                </a>
              </details>
            )}
          </div>
        </section>
      )}
      <div className="camera-layout-compare">
        <button className="text-button" onClick={compare}>
          {expanded ? "Try tabbed view" : "Compare expanded view"}
          <Icon name="grid" size={11} />
        </button>
      </div>
    </>
  );
}
