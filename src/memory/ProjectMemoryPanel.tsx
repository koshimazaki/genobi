import ThemedSelect from "../components/ThemedSelect";
import { useMemoryWrite } from "./useMemoryWrite";
import { useState } from "react";
import {
  type DecisionInput,
  type ProjectMemory,
} from "../../shared/memory/schema";
import { downloadMemory, memoryRequest, type MemoryContext } from "./client";
import TastePreferences from "./TastePreferences";
import "./memory.css";
export default function ProjectMemoryPanel({
  projectId,
}: {
  projectId: string;
}) {
  const write = useMemoryWrite();
  const [context, setContext] = useState<MemoryContext>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<DecisionInput["kind"]>("kept");
  const [reason, setReason] = useState("");
  const [objects, setObjects] = useState("");
  const [topic, setTopic] = useState("");
  const [value, setValue] = useState("");
  const [medium, setMedium] = useState("video");
  const [useCase, setUseCase] = useState("general");
  const root = `projects/${encodeURIComponent(projectId)}`;
  async function refresh() {
    const next = await memoryRequest<MemoryContext>(
      `${root}/context?medium=${encodeURIComponent(medium)}&useCase=${encodeURIComponent(useCase)}`,
    );
    setContext((current) =>
      current && current.memoryRevision > next.memoryRevision ? current : next,
    );
    return next;
  }
  async function perform(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
      await refresh();
      setMessage("Saved to this project’s private memory.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const base = () => ({
    baseRevision: context!.revision,
    memoryRevision: context!.memoryRevision,
  });
  return (
    <details
      className="memory-panel"
      onToggle={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.open)
          void refresh().catch((e) => setMessage((e as Error).message));
      }}
    >
      <summary>Project memory & taste</summary>
      <p>
        Keep decisions across agent sessions. Undo and technical reruns are
        operational evidence; they do not create a reusable dislike. This
        private history is stored locally and stays outside project ZIPs.
      </p>
      <p role="status">{message}</p>
      <button disabled={busy} onClick={() => void perform(refresh)}>
        Refresh project memory
      </button>
      {context && (
        <>
          <p>
            Project revision {context.revision} · memory revision{" "}
            {context.memoryRevision}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await write(`${root}/decisions`, {
                  ...base(),
                  kind,
                  objectIds: objects
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  source: "explicit-user",
                  ...(reason.trim() ? { reason } : {}),
                  ...(kind === "preference"
                    ? { guidance: { topic, value } }
                    : {}),
                });
                setReason("");
              });
            }}
          >
            <div className="memory-fields">
              <label>
                Decision
                <ThemedSelect
                  aria-label="Decision"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {[
                    "kept",
                    "rejected",
                    "rerun",
                    "undo",
                    "preference",
                    "note",
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                Object or take IDs
                <input
                  value={objects}
                  onChange={(e) => setObjects(e.target.value)}
                  maxLength={1000}
                  placeholder="Comma separated; optional"
                />
              </label>
            </div>
            <label>
              Reason, if known
              <textarea
                aria-label="Reason, if known"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Leave empty when the reason is unknown"
              />
            </label>
            {kind === "preference" && (
              <div className="memory-fields">
                <label>
                  Topic
                  <input
                    required
                    maxLength={80}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </label>
                <label>
                  Preference for this project
                  <input
                    required
                    maxLength={500}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </label>
              </div>
            )}
            <button disabled={busy}>Record decision</button>
          </form>
          <div className="memory-fields">
            <label>
              Medium
              <input
                value={medium}
                maxLength={40}
                onChange={(e) => setMedium(e.target.value)}
              />
            </label>
            <label>
              Use case
              <input
                value={useCase}
                maxLength={80}
                onChange={(e) => setUseCase(e.target.value)}
              />
            </label>
          </div>
          {context.guidance
            .filter((g) => g.conflict)
            .map((g) => (
              <p key={g.topic} role="status">
                Conflicting {g.topic} preferences:{" "}
                {g.choices.map((c) => c.value).join(" / ")}. Choose explicitly
                in your current request.
              </p>
            ))}
          <ol className="memory-events">
            {context.decisions.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.kind} · {event.actor}
                </strong>
                <p>{event.reason ?? "Reason unknown"}</p>
                {event.guidance && (
                  <p>
                    {event.guidance.topic}: {event.guidance.value}
                  </p>
                )}
                <small>
                  {event.id} · revision {event.revision}
                </small>
                <div className="memory-actions">
                  {event.guidance && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          write(
                            `${root}/taste`,
                            {
                              revision: context.tasteRevision,
                              preference: {
                                ...event.guidance,
                                scope: { medium, useCase },
                                evidence: [
                                  { copyId: context.copyId, eventId: event.id },
                                ],
                              },
                            },
                            "preference",
                          ),
                        )
                      }
                    >
                      Propose as reusable taste
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        memoryRequest(`${root}/forget`, {
                          revision: context.memoryRevision,
                          eventId: event.id,
                        }),
                      )
                    }
                  >
                    Forget this decision
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <details>
            <summary>Session checkpoints · {context.sessions.length}</summary>
            {context.sessions.map((s) => (
              <article key={s.id}>
                <strong>
                  {s.runner} · {s.status}
                </strong>
                <p>{s.goal}</p>
                <p>{s.summary ?? s.progress ?? "No summary received."}</p>
              </article>
            ))}
            {context.checkpoint && (
              <>
                <p>{context.checkpoint.summary}</p>
                <p>
                  Outstanding:{" "}
                  {context.checkpoint.unresolved.join("; ") || "None recorded"}
                </p>
                <p>
                  Next:{" "}
                  {context.checkpoint.nextSteps.join("; ") || "None recorded"}
                </p>
              </>
            )}
          </details>
          <details>
            <summary>References · {context.references.length}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                void perform(async () => {
                  await write(`${root}/references`, {
                    ...base(),
                    ...(data.get("assetId")
                      ? { assetId: data.get("assetId") }
                      : {}),
                    ...(data.get("url") ? { url: data.get("url") } : {}),
                    purpose: data.get("purpose"),
                    observation: data.get("observation"),
                    ...(data.get("author")
                      ? { author: data.get("author") }
                      : {}),
                    ...(data.get("licence")
                      ? { licence: data.get("licence") }
                      : {}),
                  });
                  form.reset();
                });
              }}
            >
              <label>
                Source URL
                <input type="url" name="url" maxLength={2000} />
              </label>
              <label>
                Or existing project asset ID
                <input name="assetId" maxLength={80} />
              </label>
              <label>
                Use for
                <ThemedSelect name="purpose" aria-label="Reference purpose">
                  {[
                    "style",
                    "motion",
                    "camera",
                    "timing",
                    "audio",
                    "element",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                Why this reference?
                <textarea
                  aria-label="Why this reference?"
                  required
                  name="observation"
                  maxLength={500}
                />
              </label>
              <div className="memory-fields">
                <label>
                  Author, if known
                  <input name="author" maxLength={120} />
                </label>
                <label>
                  Licence, if known
                  <input name="licence" maxLength={200} />
                </label>
              </div>
              <button disabled={busy}>Add reference</button>
            </form>
            {context.references.map((r) => (
              <article key={r.id}>
                <strong>{r.purpose}</strong>
                <p>{r.url ?? r.assetId}</p>
                <p>{r.observation}</p>
                <p>
                  {r.author ?? "Author unknown"} ·{" "}
                  {r.licence ?? "Rights unknown"} · source not fetched
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      memoryRequest(`${root}/forget`, {
                        revision: context.memoryRevision,
                        referenceId: r.id,
                      }),
                    )
                  }
                >
                  Remove reference
                </button>
              </article>
            ))}
          </details>
          <div className="memory-actions">
            <button
              onClick={() =>
                void perform(async () =>
                  downloadMemory(
                    await memoryRequest<ProjectMemory>(`${root}/memory-export`),
                    "genobi-project-memory-private.json",
                  ),
                )
              }
            >
              Export private project history
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  memoryRequest(`${root}/forget`, {
                    revision: context.memoryRevision,
                  }),
                )
              }
            >
              Clear private project history
            </button>
          </div>
          <TastePreferences />
        </>
      )}
    </details>
  );
}
