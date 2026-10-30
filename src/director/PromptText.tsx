import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { acceptsStudioMedia } from "../studio/media-drop";
import type { Bundle } from "./bundle";
import type { PromptReference } from "./prompt-brief";
import { PromptLines } from "./PromptLines";
import { promptLayout } from "./prompt-fields";
import {
  promptCaretRect,
  promptDomText,
  promptSelection,
  setPromptSelection,
} from "./prompt-dom";
/** Typing right after a label's colon lands in the label; redraw it apart. */
const strayLabel = (element: HTMLElement) =>
  [...element.querySelectorAll(".prompt-field-label")].some(
    (label) => !/^[A-Za-z ]{1,24}:$/.test(label.textContent ?? ""),
  );
export interface PromptTextHandle {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
  caretRect: () => DOMRect | undefined;
}
/** Native text editing owns its DOM until a binding or external text changes. */
export const PromptText = forwardRef<
  PromptTextHandle,
  {
    bundle: Bundle;
    value: string;
    references: PromptReference[];
    disabled: boolean;
    onChange: (text: string, caret: number) => void;
    onSelect: (selection: { start: number; end: number }) => void;
    onSwap: (reference: PromptReference, button: HTMLElement) => void;
    onPreview: (reference: PromptReference) => void;
    onDropOn: (reference: PromptReference, transfer: DataTransfer) => void;
    onUndo: () => void;
    menuOpen: boolean;
    onMenuNext: () => void;
    onMenuClose: () => void;
  }
>(function PromptText(
  {
    bundle,
    value,
    references,
    disabled,
    onChange,
    onSelect,
    onSwap,
    onPreview,
    onDropOn,
    onUndo,
    menuOpen,
    onMenuNext,
    onMenuClose,
  },
  ref,
) {
  const editor = useRef<HTMLDivElement>(null),
    composing = useRef(false);
  const caret = useRef({ start: value.length, end: value.length });
  const fingerprint = references
    .map(
      (r) =>
        `${r.id}:${r.label}:${r.assetId && bundle.project.assets[r.assetId]?.file.sha256}:${r.font?.file.sha256}:${r.font?.name}`,
    )
    .join("|");
  const [snapshot, setSnapshot] = useState({
    text: value,
    references,
    bundle,
    fingerprint,
    version: 0,
  });
  const restore = useRef(false);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.current?.focus(),
      setSelectionRange: (start, end) => {
        caret.current = { start, end };
        if (editor.current) setPromptSelection(editor.current, start, end);
      },
      caretRect: () =>
        editor.current ? promptCaretRect(editor.current) : undefined,
    }),
    [],
  );
  useLayoutEffect(() => {
    const element = editor.current;
    if (!element || composing.current) return;
    // A new line, label, swatch or tile row redraws the fields; typing
    // inside a field body keeps the browser's own DOM.
    if (
      promptDomText(element) !== value ||
      fingerprint !== snapshot.fingerprint ||
      promptLayout(value) !== promptLayout(snapshot.text) ||
      strayLabel(element)
    ) {
      restore.current =
        element === document.activeElement ||
        element.contains(document.activeElement);
      caret.current = promptSelection(element) ?? caret.current;
      setSnapshot((v) => ({
        text: value,
        references,
        bundle,
        fingerprint,
        version: v.version + 1,
      }));
    }
  }, [
    value,
    fingerprint,
    snapshot.fingerprint,
    snapshot.text,
    bundle,
    references,
  ]);
  useLayoutEffect(() => {
    if (restore.current && editor.current) {
      restore.current = false;
      // Read the caret first: focusing runs onFocus, which records the
      // browser's default caret (the start) over it.
      const { start, end } = caret.current;
      editor.current.focus();
      setPromptSelection(
        editor.current,
        Math.min(start, snapshot.text.length),
        Math.min(end, snapshot.text.length),
      );
      caret.current = { start, end };
    }
  }, [snapshot]);
  function change() {
    const element = editor.current;
    if (!element || composing.current) return;
    const text = promptDomText(element).slice(0, 12000);
    caret.current = promptSelection(element) ?? {
      start: text.length,
      end: text.length,
    };
    onSelect(caret.current);
    onChange(text, Math.min(caret.current.end, text.length));
  }
  function select() {
    const next = editor.current && promptSelection(editor.current);
    if (next) {
      caret.current = next;
      onSelect(next);
    }
  }
  function copy(event: React.ClipboardEvent, cut = false) {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (!range || !editor.current?.contains(range.commonAncestorContainer))
      return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      promptDomText(range.cloneContents()),
    );
    if (cut && !disabled) {
      range.deleteContents();
      change();
    }
  }
  return (
    <div className="prompt-text-editor">
      <div
        key={snapshot.version}
        ref={editor}
        id="project-prompt-text"
        role="textbox"
        aria-label="Animation prompt"
        aria-multiline="true"
        aria-disabled={disabled}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? "prompt-reference-picker" : undefined}
        className="prompt-text-surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        tabIndex={0}
        data-empty={!value || undefined}
        data-placeholder="Describe what you want to make. Type @ or add to link a character, style, image or font…"
        onInput={change}
        onKeyUp={select}
        onMouseUp={select}
        onFocus={select}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          change();
        }}
        onCopy={(e) => copy(e)}
        onCut={(e) => copy(e, true)}
        onDrop={(e) => {
          if (!acceptsStudioMedia(e.dataTransfer.types)) e.preventDefault();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const selection = window.getSelection();
          if (
            !selection?.rangeCount ||
            !editor.current?.contains(selection.anchorNode)
          )
            return;
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(
            e.clipboardData.getData("text/plain").slice(0, 12000),
          );
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          change();
          // Rebuild pasted canonical references as chips; plain text stays plain.
          if (editor.current) {
            restore.current = true;
            setSnapshot((v) => ({
              text: promptDomText(editor.current!).slice(0, 12000),
              references,
              bundle,
              fingerprint,
              version: v.version + 1,
            }));
          }
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (!e.shiftKey) onUndo();
          }
          if (menuOpen && e.key === "ArrowDown") {
            e.preventDefault();
            onMenuNext();
          }
          if (menuOpen && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onMenuClose();
          }
        }}
      >
        <PromptLines
          text={snapshot.text}
          bundle={snapshot.bundle}
          references={snapshot.references}
          actions={{ onSwap, onPreview, onDropOn }}
        />
      </div>
    </div>
  );
});
