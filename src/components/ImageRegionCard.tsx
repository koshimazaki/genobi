import ThemedSelect from "./ThemedSelect";
import { useRef, useState } from "react";
import {
  IMAGE_ACCEPT,
  REFERENCE_DRAG,
  type ImageReferences,
} from "../useImageReferences";
import type { ImageRegion } from "../image-regions";
import Icon from "./Icon";

export default function ImageRegionCard({
  region,
  index,
  edit,
  refs,
  images,
  onChange,
  onRemove,
  onClose,
}: {
  region: ImageRegion;
  index: number;
  edit: boolean;
  refs: string[];
  images: ImageReferences;
  onChange: (region: ImageRegion) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const reference =
    region.referenceIndex === undefined
      ? undefined
      : refs[region.referenceIndex];
  const takesReference = edit && region.action === "change";
  return (
    <section
      className="region-card"
      aria-label={`Box ${index + 1} controls`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (takesReference) setExpanded(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!takesReference) return;
        const value = e.dataTransfer.getData(REFERENCE_DRAG);
        if (value !== "") images.assign(region.id, Number(value));
        else void images.add(Array.from(e.dataTransfer.files), region.id);
      }}
    >
      <header>
        <strong>BOX {index + 1}</strong>
        <button aria-label="Close box controls" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </header>
      {edit && (
        <ThemedSelect
          aria-label={`Box ${index + 1} action`}
          value={region.action}
          onChange={(e) => {
            const action = e.target.value as ImageRegion["action"];
            onChange({
              ...region,
              action,
              referenceIndex:
                action === "change" ? region.referenceIndex : undefined,
              target:
                action === "move"
                  ? (region.target ?? [...region.box])
                  : undefined,
            });
          }}
        >
          <option value="change">Change / add</option>
          <option value="keep">Keep</option>
          <option value="move">Move</option>
          <option value="remove">Remove</option>
        </ThemedSelect>
      )}
      <textarea
        aria-label={`Box ${index + 1} description`}
        rows={2}
        maxLength={500}
        value={region.description}
        placeholder={
          takesReference
            ? "Describe the change, or drop a reference…"
            : edit
              ? "Describe the element (optional)"
              : "What belongs here?"
        }
        onChange={(e) => onChange({ ...region, description: e.target.value })}
      />
      {takesReference && (
        <>
          <button
            className="region-reference-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {reference ? (
              <img src={reference} alt={`Box ${index + 1} reference`} />
            ) : (
              <Icon name="image" size={17} />
            )}
            {reference
              ? `Image ${region.referenceIndex! + 1}`
              : "Reference image"}{" "}
            <Icon name="chevron" size={12} />
          </button>
          {expanded && (
            <div className="region-reference-expanded">
              <button
                className="region-drop"
                disabled={images.loading}
                onClick={() => input.current?.click()}
              >
                <Icon name="image" size={23} />
                <span>Drop an image here or choose a file</span>
              </button>
              <ThemedSelect
                aria-label={`Reference for box ${index + 1}`}
                value={region.referenceIndex ?? ""}
                onChange={(e) =>
                  onChange({
                    ...region,
                    referenceIndex:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              >
                <option value="">No reference</option>
                {refs.map((_, i) => (
                  <option value={i} key={i}>
                    Image {i + 1}
                    {i === 0 ? " · source" : ""}
                  </option>
                ))}
              </ThemedSelect>
            </div>
          )}
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label={`Choose reference for box ${index + 1}`}
            accept={IMAGE_ACCEPT}
            onChange={(e) => {
              void images.add(Array.from(e.target.files ?? []), region.id);
              e.target.value = "";
            }}
          />
        </>
      )}
      {region.action === "move" && (
        <p>Drag the dashed target to its new position.</p>
      )}
      <details>
        <summary>Coordinates</summary>
        {(
          ["box", ...(region.action === "move" ? ["target"] : [])] as const
        ).map((part) => {
          const box =
            (part === "target" ? region.target : region.box) ?? region.box;
          return (
            <div className="region-coordinates" key={part}>
              {["Top", "Left", "Bottom", "Right"].map((label, i) => (
                <label key={label}>
                  {part === "target" ? "Target " : ""}
                  {label}
                  <input
                    aria-label={`Box ${index + 1} ${part} ${label.toLowerCase()}`}
                    type="number"
                    min={0}
                    max={1000}
                    value={box[i]}
                    onChange={(e) => {
                      const next = [...box] as ImageRegion["box"],
                        n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      next[i] = Math.max(
                        i < 2 ? 0 : box[i - 2] + 10,
                        Math.min(i < 2 ? box[i + 2] - 10 : 1000, n),
                      );
                      onChange({ ...region, [part]: next });
                    }}
                  />
                </label>
              ))}
            </div>
          );
        })}
      </details>
      <button className="text-button" onClick={onRemove}>
        Remove box
      </button>
    </section>
  );
}
