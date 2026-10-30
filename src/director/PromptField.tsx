import { useEffect, useRef, useState } from "react";
import "./prompt-field.css";

/**
 * A prompt written into the project through a Director command: the draft
 * is local while typing and committed once, on leaving the field, so undo
 * holds one step per edit. A field that goes away with a draft (another clip
 * selected, the inspector closed) commits it first, so no words are lost.
 * A change from elsewhere (an agent, an undo) replaces an untouched draft;
 * over a draft the person is writing it is offered, never forced. Committing
 * never quotes or submits anything. The timeline port restyles these fields.
 */
export default function PromptField({
  label,
  value,
  limit,
  disabled,
  placeholder,
  commit,
}: {
  label: string;
  value: string;
  limit: number;
  disabled?: boolean;
  placeholder?: string;
  /** Runs the command; returns the refusal, or "" when it applied. */
  commit: (text: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  /** The value from elsewhere, while the person's own draft differs from it. */
  const [theirs, setTheirs] = useState<string>();
  const [error, setError] = useState("");
  if (value !== seen) {
    setSeen(value);
    if (draft === seen || draft === value) {
      setDraft(value);
      setTheirs(undefined);
    } else setTheirs(value);
  }
  // The latest state, for the commit a field makes as it goes away.
  const latest = useRef({ draft, value, theirs, commit });
  useEffect(() => {
    latest.current = { draft, value, theirs, commit };
  });
  useEffect(
    () => () => {
      const { draft, value, theirs, commit } = latest.current;
      // An unanswered conflict keeps the project's value: nothing is
      // written over a change the person has not seen through.
      if (draft !== value && theirs === undefined) commit(draft);
    },
    [],
  );
  function save(text: string) {
    const refusal = commit(text);
    setError(refusal);
    // Applied: the field matches the project, so going away writes nothing.
    if (!refusal) latest.current = { ...latest.current, value: text };
  }
  return (
    <label className="dir-prompt-field">
      {label}
      <textarea
        aria-label={label}
        value={draft}
        maxLength={limit}
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value && theirs === undefined) save(draft);
        }}
      />
      {theirs !== undefined && (
        <span className="dir-prompt-conflict" role="status">
          Changed elsewhere while you were writing.
          <button
            type="button"
            onClick={() => {
              setTheirs(undefined);
              save(draft);
            }}
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(theirs);
              setTheirs(undefined);
            }}
          >
            Use theirs
          </button>
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
