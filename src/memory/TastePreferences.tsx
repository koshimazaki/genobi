import { useState } from "react";
import type { TastePreference, TasteProfile } from "../../shared/memory/schema";
import { downloadMemory, memoryRequest, readProfile } from "./client";
import "./memory.css";
export default function TastePreferences() {
  const [profile, setProfile] = useState<TasteProfile>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TastePreference>();
  async function refresh() {
    try {
      setProfile(await readProfile());
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function manage(
    id: string,
    action: "activate" | "disable" | "delete",
    edit?: TastePreference,
  ) {
    if (!profile) return;
    setBusy(true);
    try {
      const clean = edit && {
        id: edit.id,
        topic: edit.topic,
        value: edit.value,
        scope: edit.scope,
        evidence: edit.evidence,
        ...(edit.supersedes ? { supersedes: edit.supersedes } : {}),
      };
      await memoryRequest("taste", {
        revision: profile.revision,
        id,
        action,
        ...(clean ? { edit: clean } : {}),
      });
      setEditing(undefined);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="memory-panel"
      onToggle={(e) => {
        if (e.currentTarget.open) void refresh();
      }}
    >
      <summary>My reusable taste · local studio</summary>
      <p>
        Preferences apply only to their medium and use case. Your current
        request takes priority. Agents can propose; you choose what becomes
        reusable. Use * for any medium or use case.
      </p>
      <p role="status">{message}</p>
      {profile && (
        <>
          {!profile.preferences.length && (
            <p>
              No reusable preferences yet. Record a decision in your Director
              project, then propose it here from Project memory.
            </p>
          )}
          {profile.preferences.map((p) => (
            <article key={p.id}>
              <strong>{p.topic}</strong>
              <p>{p.value}</p>
              <p>
                {p.scope.medium} / {p.scope.useCase} · {p.status} · proposed by{" "}
                {p.author}
              </p>
              <p>Evidence: {p.evidence.map((e) => e.eventId).join(", ")}</p>
              <div className="memory-actions">
                <button
                  disabled={busy}
                  onClick={() => setEditing(structuredClone(p))}
                >
                  Edit {p.topic}
                </button>
                <button
                  disabled={busy || p.status === "active"}
                  onClick={() => void manage(p.id, "activate")}
                >
                  Use for this scope
                </button>
                <button
                  disabled={busy || p.status === "disabled"}
                  onClick={() => void manage(p.id, "disable")}
                >
                  Disable {p.topic}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void manage(p.id, "delete")}
                >
                  Delete {p.topic}
                </button>
              </div>
            </article>
          ))}
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void manage(editing.id, "activate", editing);
              }}
            >
              <label>
                Preference topic
                <input
                  required
                  maxLength={80}
                  value={editing.topic}
                  onChange={(e) =>
                    setEditing({ ...editing, topic: e.target.value })
                  }
                />
              </label>
              <label>
                Preference statement
                <textarea
                  aria-label="Preference statement"
                  required
                  maxLength={500}
                  value={editing.value}
                  onChange={(e) =>
                    setEditing({ ...editing, value: e.target.value })
                  }
                />
              </label>
              <div className="memory-fields">
                <label>
                  Medium
                  <input
                    required
                    maxLength={40}
                    value={editing.scope.medium}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scope: { ...editing.scope, medium: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Use case
                  <input
                    required
                    maxLength={80}
                    value={editing.scope.useCase}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scope: { ...editing.scope, useCase: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <button disabled={busy}>Save and use preference</button>
              <button type="button" onClick={() => setEditing(undefined)}>
                Cancel edit
              </button>
            </form>
          )}
          <button
            onClick={() => downloadMemory(profile, "genobi-taste-private.json")}
          >
            Export my taste profile
          </button>
        </>
      )}
    </details>
  );
}
