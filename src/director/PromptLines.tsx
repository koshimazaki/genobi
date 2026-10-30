import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { acceptsStudioMedia } from "../studio/media-drop";
import type { Bundle } from "./bundle";
import type { PromptReference } from "./prompt-brief";
import { promptLines, swatchPieces, type PromptLine } from "./prompt-fields";
import { PromptThumbnail } from "./PromptThumbnail";

export interface ChipActions {
  onSwap: (reference: PromptReference, button: HTMLElement) => void;
  onPreview: (reference: PromptReference) => void;
  onDropOn: (reference: PromptReference, transfer: DataTransfer) => void;
}

const TOKENS = /(\[(?:Image|Video|Inspiration|Font) [1-9][0-9]?\])/g;

/**
 * A reference chip's events. Click swaps, as before; a double-click opens the
 * file large (the first click of it has already opened the swap menu, which
 * the preview closes); a media drop on the chip replaces that file.
 */
export function chipHandlers(reference: PromptReference, actions: ChipActions) {
  return {
    onClick(e: MouseEvent<HTMLElement>) {
      if (e.detail > 1) return;
      actions.onSwap(reference, e.currentTarget);
    },
    onDoubleClick(e: MouseEvent<HTMLElement>) {
      e.preventDefault();
      if (!reference.font) actions.onPreview(reference);
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        actions.onSwap(reference, e.currentTarget);
      }
    },
    onDragOver(e: DragEvent<HTMLElement>) {
      if (!acceptsStudioMedia(e.dataTransfer.types) || reference.font) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      e.currentTarget.dataset.dropTarget = "";
    },
    onDragLeave(e: DragEvent<HTMLElement>) {
      delete e.currentTarget.dataset.dropTarget;
    },
    onDrop(e: DragEvent<HTMLElement>) {
      if (!acceptsStudioMedia(e.dataTransfer.types) || reference.font) return;
      e.preventDefault();
      e.stopPropagation();
      delete e.currentTarget.dataset.dropTarget;
      actions.onDropOn(reference, e.dataTransfer);
    },
  };
}

function Chip({
  bundle,
  reference,
  actions,
}: {
  bundle: Bundle;
  reference: PromptReference;
  actions: ChipActions;
}) {
  return (
    <span
      data-prompt-ref={reference.label}
      contentEditable={false}
      className="prompt-inline-reference"
      role="button"
      tabIndex={0}
      aria-label={`Change ${reference.label}`}
      title={
        reference.font
          ? undefined
          : "Click to swap, double-click to view, drop a file to replace"
      }
      {...chipHandlers(reference, actions)}
    >
      <PromptThumbnail bundle={bundle} reference={reference} />
      <span>{reference.label}</span>
      <span aria-hidden="true">⌄</span>
    </span>
  );
}

function Body({
  line,
  bundle,
  references,
  actions,
}: {
  line: PromptLine;
  bundle: Bundle;
  references: PromptReference[];
  actions: ChipActions;
}) {
  return line.body.split(TOKENS).map((piece, i) => {
    const reference = references.find((r) => `[${r.label}]` === piece);
    if (reference)
      return (
        <Chip
          key={`${i}-${reference.id}`}
          bundle={bundle}
          reference={reference}
          actions={actions}
        />
      );
    if (!line.swatches.length) return piece;
    return swatchPieces(piece).map((p, j) =>
      p.hex ? (
        <span key={`${i}-${j}`} className="prompt-hex">
          <span
            data-prompt-decoration=""
            contentEditable={false}
            aria-hidden="true"
            className="prompt-swatch"
            style={{ "--swatch": p.hex } as CSSProperties}
          />
          {p.text}
        </span>
      ) : (
        p.text
      ),
    );
  });
}

/**
 * The prompt's lines inside the editor: one block per line, labelled lines
 * as fields with a coloured label, palette hexes with a swatch and reference
 * tokens as chips. `promptDomText` reads the same text back.
 */
export function PromptLines({
  text,
  bundle,
  references,
  actions,
}: {
  text: string;
  bundle: Bundle;
  references: PromptReference[];
  actions: ChipActions;
}) {
  return promptLines(text).map((line, i) => (
    <div
      key={i}
      className="prompt-line"
      data-field={line.field}
      data-tiles={line.tiles || undefined}
    >
      {line.label && <span className="prompt-field-label">{line.label}</span>}
      {line.body ? (
        <Body
          line={line}
          bundle={bundle}
          references={references}
          actions={actions}
        />
      ) : (
        !line.label && <br />
      )}
    </div>
  ));
}
