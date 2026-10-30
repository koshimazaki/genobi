import { useEffect, useRef, useState } from "react";
import {
  cameraGuide,
  guideSectionUrl,
  termName,
  termsFor,
  type CameraSection,
  type CameraTermId,
} from "../../shared/camera";
import type { VideoModel } from "../../shared/types";
import CameraGlyph from "./CameraGlyph";
import Icon from "./Icon";

export default function CameraPresetGrid({
  section,
  selected,
  onSelect,
  model = "flux-3",
}: {
  section: CameraSection;
  selected: CameraTermId | null;
  onSelect: (id: CameraTermId | null) => void;
  model?: VideoModel;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const guide = cameraGuide(model);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const element = grid.current!;
    const update = () =>
      setEdges({
        start: element.scrollLeft <= 4,
        end:
          element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);
  function slide(direction: number) {
    const element = grid.current!;
    element.scrollBy({
      left: direction * element.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <>
      <div
        className="camera-preset-grid"
        ref={grid}
        role="group"
        aria-label={section.label}
      >
        {termsFor(section, model).map((term) => (
          <button
            key={term.id}
            className={`preset ${selected === term.id ? "selected" : ""}`}
            aria-pressed={selected === term.id}
            title={term.description}
            onFocus={(event) => {
              const item = event.currentTarget;
              const viewport = grid.current!;
              if (
                item.offsetLeft < viewport.scrollLeft ||
                item.offsetLeft + item.offsetWidth >
                  viewport.scrollLeft + viewport.clientWidth
              )
                viewport.scrollTo({
                  left: item.offsetLeft,
                  behavior: "instant",
                });
            }}
            onClick={() => onSelect(term.id)}
          >
            <CameraGlyph section={section} term={term} />
            <span>{termName(term, model)}</span>
            <i className="selection-dot" />
          </button>
        ))}
      </div>
      <div className="camera-grid-footer">
        <a
          href={guideSectionUrl(section, model)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${section.label} in the ${guide.name}`}
        >
          {guide.name} <Icon name="arrow" size={10} />
        </a>
        <button
          className={`camera-none ${selected === null ? "selected" : ""}`}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          None
        </button>
        <div className="camera-grid-arrows">
          <button
            className="icon-button"
            aria-label={`Previous ${section.label.toLowerCase()} presets`}
            disabled={edges.start}
            onClick={() => slide(-1)}
          >
            <Icon
              name="chevron"
              size={13}
              style={{ transform: "rotate(90deg)" }}
            />
          </button>
          <button
            className="icon-button"
            aria-label={`Next ${section.label.toLowerCase()} presets`}
            disabled={edges.end}
            onClick={() => slide(1)}
          >
            <Icon
              name="chevron"
              size={13}
              style={{ transform: "rotate(-90deg)" }}
            />
          </button>
        </div>
      </div>
    </>
  );
}
