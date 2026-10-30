import { useState } from "react";
import { NOTE_TEXT_LIMIT, type NoteCommand } from "../../shared/director/notes";
import type { Layer, Project } from "../../shared/director/types";
import Icon from "../components/Icon";
import { timecode, type TimeUnits } from "./timecode";
import "./notes.css";

/**
 * Frame notes: add one at the playhead, optionally on the selected layer,
 * then go to, reword, resolve or delete it. Each change is a note command
 * (or, for new words, the studio's own edit), so it is undoable and reaches
 * the project copy like any other edit.
 */
export default function NotesPanel({
  project,
  frame,
  layer,
  units,
  disabled,
  run,
  edit,
  seek,
  select,
  close,
}: {
  project: Project;
  frame: number;
  layer?: Layer;
  units: TimeUnits;
  disabled: boolean;
  /** Apply a note command, with an unsaved rewording first; returns why it was refused, or "". */
  run: (
    command: NoteCommand,
    reworded?: { id: string; text: string },
  ) => string;
  edit: (id: string, text: string) => string;
  seek: (frame: number) => void;
  select: (id: string) => void;
  close: () => void;
}) {
  const [text, setText] = useState("");
  const [attach, setAttach] = useState(true);
  const [error, setError] = useState("");
  const { fps } = project.composition;
  const at = (f: number) => timecode(f, fps, units);
  const names = new Map(project.layers.map((l) => [l.id, l.name]));
  const notes = (project.notes ?? [])
    .map((n, order) => ({ n, order }))
    .sort((a, b) => a.n.frame - b.n.frame || a.order - b.order)
    .map(({ n }) => n);
  const open = notes.filter((n) => !n.resolved).length;
  const report = (refusal: string) => {
    setError(refusal);
    return !refusal;
  };
  function add() {
    const done = report(
      run({
        op: "add-note",
        noteId: `note-${crypto.randomUUID().slice(0, 8)}`,
        frame,
        text,
        ...(layer && attach ? { layerId: layer.id } : {}),
        author: "person",
        createdAt: new Date().toISOString(),
      }),
    );
    if (done) setText("");
  }
  return (
    <aside className="dir-notes" aria-label="Frame notes">
      <header>
        <span>FRAME NOTES</span>
        <small>
          {open} open · {notes.length - open} resolved
        </small>
        <button
          className="dir-icon-button"
          onClick={close}
          aria-label="Close notes"
          title="Close notes"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <form
        className="dir-note-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <textarea
          aria-label="New note"
          placeholder="Move the HUD lower; extend this title by a beat…"
          rows={2}
          maxLength={NOTE_TEXT_LIMIT}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds; Shift+Enter is still a space, since notes are one line.
            // While an input method composes (Japanese, Chinese, Korean), Enter
            // accepts the candidate instead.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="dir-note-add-row">
          <label className="dir-check" title="Pin the note to this layer too">
            <input
              type="checkbox"
              checked={Boolean(layer) && attach}
              disabled={disabled || !layer}
              onChange={(e) => setAttach(e.target.checked)}
            />
            <span>{layer ? `On ${layer.name}` : "No layer selected"}</span>
          </label>
          <button type="submit" disabled={disabled || !text.trim()}>
            Add note at {at(frame)}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      {notes.length ? (
        <ol className="dir-note-list">
          {notes.map((n) => {
            const where = `${at(n.frame)}${n.layerId ? ` · ${names.get(n.layerId)}` : ""}`;
            return (
              <li
                key={n.id}
                data-note={n.id}
                className={n.resolved ? "is-resolved" : ""}
                // New words are saved when focus leaves the whole note: moving
                // to its own Resolve or Delete keeps them for that action,
                // which saves both at once.
                onBlur={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null))
                    return;
                  const words =
                    e.currentTarget.querySelector("textarea")?.value;
                  if (words !== undefined && words.trim() !== n.text)
                    report(edit(n.id, words));
                }}
              >
                <div className="dir-note-head">
                  <button
                    className="dir-note-go"
                    disabled={disabled}
                    aria-label={`Go to note at ${where}`}
                    onClick={() => {
                      seek(n.frame);
                      if (n.layerId) select(n.layerId);
                    }}
                  >
                    {where}
                  </button>
                  {n.author && <small>{n.author}</small>}
                </div>
                <textarea
                  aria-label={`Note at ${at(n.frame)}`}
                  rows={2}
                  maxLength={NOTE_TEXT_LIMIT}
                  key={n.text}
                  defaultValue={n.text}
                  disabled={disabled}
                />
                <div
                  className="dir-note-actions"
                  // Keep focus in the note so its blur does not commit first.
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button
                    disabled={disabled}
                    onClick={(e) => {
                      const words = e.currentTarget
                        .closest("li")
                        ?.querySelector("textarea")?.value;
                      report(
                        run(
                          {
                            op: "resolve-note",
                            noteId: n.id,
                            resolved: !n.resolved,
                          },
                          words !== undefined && words.trim() !== n.text
                            ? { id: n.id, text: words }
                            : undefined,
                        ),
                      );
                    }}
                  >
                    {n.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    disabled={disabled}
                    aria-label={`Delete note at ${where}`}
                    onClick={() =>
                      report(run({ op: "delete-note", noteId: n.id }))
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dir-note-empty">
          No notes yet. Pause on a frame, select a layer if the note is about
          one, and say what should change. Linked agents read these.
        </p>
      )}
    </aside>
  );
}
