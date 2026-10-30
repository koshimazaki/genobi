import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import type { ArenaSlot } from "../../shared/arena";
import Icon from "../components/Icon";
import { useShell } from "../studio/ShellContext";
import { useAgentSession } from "../agent/useAgentSession";
import { arenaAgentPrompt, registerArenaContext } from "./agent-context";
import { arenaPost } from "./client";
import { exportRecord } from "./arena-drag";
import { ArenaRunRequest } from "./ArenaRunRequest";
import ArenaGenerator from "./ArenaGenerator";
import { acceptsStudioMedia, studioDropFile } from "../studio/media-drop";
import type { Bundle } from "../director/bundle";
import { runnable, useArenaRuns } from "./useArenaRuns";
import { useArena } from "./useArena";
import { useArenaPlayback } from "./useArenaPlayback";
import { ArenaCard } from "./ArenaCard";
import ArenaTransport from "./ArenaTransport";
import ArenaLightbox from "./ArenaLightbox";
import "./arena.css";

export default function ArenaView({
  active,
  bundle,
}: {
  active: boolean;
  /** The open project, so its Project and Inspirations assets can be dropped in. */
  bundle?: Bundle;
}) {
  const state = useArena(active),
    runs = useArenaRuns(state, active),
    shell = useShell(),
    agent = useAgentSession();
  const { arena, draft } = state;
  const playback = useArenaPlayback(
    active,
    `${arena?.id}:${draft.slots.map((s) => s.media).join()}`,
  );
  const [enlarged, setEnlarged] = useState<string | "all">();
  function enlarge(slot: string) {
    playback.pause();
    setEnlarged(slot);
  }
  const [audio, setAudio] = useState<string>();
  const [code, setCode] = useState("");
  const [openCode, setOpenCode] = useState("");
  const referenceInput = useRef<HTMLInputElement>(null);
  // Drag identity is read synchronously in the drop; bytes resolve after.
  const dropMedia = (transfer: DataTransfer, slotId?: string) =>
    void state.act(async () => {
      const file = await studioDropFile(transfer, bundle, shell?.library);
      if (!file) throw new Error("Drop a video or image.");
      await state.upload(file, slotId);
    });
  const latest = useRef(state);
  latest.current = state;
  const arenaId = arena?.id;
  useEffect(() => {
    if (!active || !arenaId) return;
    return registerArenaContext(async () => {
      if (latest.current.busy)
        throw new Error("Wait for the current Arena edit to finish.");
      const saved = await latest.current.save();
      const linked = await arenaPost<{ code: string }>(`/${saved.id}/link`, {});
      return { id: saved.id, code: linked.code };
    });
  }, [active, arenaId]);
  const patch = (id: string, change: Partial<ArenaSlot>) =>
    state.edit({
      ...draft,
      slots: draft.slots.map((s) => (s.id === id ? { ...s, ...change } : s)),
    });
  return (
    <section className="arena" aria-label="Arena comparison">
      <div className="arena-heading">
        <div>
          <span className="section-eyebrow">PROJECT TOOLS / COMPARE</span>
          <h2>Arena</h2>
        </div>
        <div className="arena-actions">
          <button
            disabled={!arena || !draft.slots.some((s) => s.media)}
            onClick={() => enlarge("all")}
          >
            <Icon name="expand" size={14} /> Enlarge comparison
          </button>
          <details className="arena-open">
            <summary>Open code</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void state.link(openCode);
              }}
            >
              <label>
                Comparison code
                <input
                  aria-label="Comparison code"
                  value={openCode}
                  onChange={(e) => setOpenCode(e.target.value)}
                  maxLength={32}
                />
              </label>
              <button disabled={state.busy}>Open comparison</button>
            </form>
          </details>
          {state.items.length > 0 && (
            <ThemedSelect
              aria-label="Comparison"
              disabled={state.busy}
              value={arena?.id ?? ""}
              onChange={(e) => void state.select(e.target.value)}
            >
              {state.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </ThemedSelect>
          )}
          <button disabled={state.busy} onClick={() => void state.create()}>
            <Icon name="plus" size={14} />
            New comparison
          </button>
        </div>
      </div>
      {!arena ? (
        <div className="arena-welcome">
          <Icon name="film" size={24} />
          <p>One scene. A few ways to make it.</p>
          <span>Compare two to four results with a shared playback clock.</span>
          <button
            className="primary-button"
            disabled={state.busy}
            onClick={() => void state.create()}
          >
            Create comparison <Icon name="arrow" size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="arena-title">
            <h3>{draft.title}</h3>
            <span>{draft.slots.length} loads · drop Assets on a card</span>
          </div>
          <ArenaRunRequest
            arena={arena}
            busy={state.busy}
            onRun={(slots) => void state.act(() => runs.run(slots))}
            act={state.act}
            adopt={state.adopt}
          />
          <ArenaGenerator
            arena={arena}
            draft={draft}
            busy={state.busy}
            jobs={runs.jobs}
            onEdit={state.edit}
            onPatch={patch}
            onGenerate={(slots) => void state.act(() => runs.run(slots))}
            onDropReference={(transfer) => dropMedia(transfer)}
            onAddReference={() => referenceInput.current?.click()}
          />
          <div
            className="arena-grid"
            style={{
              gridTemplateColumns: `repeat(${draft.slots.length}, minmax(0,1fr))`,
            }}
          >
            {draft.slots.map((slot, index) => (
              <ArenaCard
                key={slot.id}
                arena={arena}
                slot={slot}
                index={index}
                preferred={draft.preferred === slot.id}
                busy={state.busy}
                onError={(message) =>
                  void state.act(async () => {
                    throw new Error(message);
                  })
                }
                audio={audio === slot.id}
                library={shell?.library}
                onAudio={() =>
                  setAudio(audio === slot.id ? undefined : slot.id)
                }
                onChange={(change) => patch(slot.id, change)}
                onUpload={(file) =>
                  void state.act(() => state.upload(file, slot.id))
                }
                onDropMedia={(transfer) => dropMedia(transfer, slot.id)}
                job={runs.jobs[slot.id]}
                canRun={runnable(slot, runs.jobs)}
                onRun={() => void state.act(() => runs.run([slot.id]))}
                onPrefer={() =>
                  state.edit({
                    ...draft,
                    preferred:
                      draft.preferred === slot.id ? undefined : slot.id,
                  })
                }
                onRemove={
                  draft.slots.length > 2
                    ? () =>
                        state.edit({
                          ...draft,
                          preferred:
                            draft.preferred === slot.id
                              ? undefined
                              : draft.preferred,
                          slots: draft.slots.filter((s) => s.id !== slot.id),
                        })
                    : undefined
                }
                bind={(video) => {
                  if (video) playback.videos.current.set(slot.id, video);
                  else playback.videos.current.delete(slot.id);
                }}
                onLoaded={playback.loaded}
                onEnlarge={() => enlarge(slot.id)}
                soloing={playback.soloing === slot.id}
                onSolo={() => void playback.solo(slot.id)}
              />
            ))}
          </div>
          <ArenaTransport
            playback={playback}
            sourceSeconds={draft.sourceSeconds}
          />
          <div className="arena-composer composer">
            <details
              className="arena-details arena-brief"
              onDragOver={(e) => {
                if (acceptsStudioMedia(e.dataTransfer.types))
                  e.preventDefault();
              }}
              onDrop={(e) => {
                if (!acceptsStudioMedia(e.dataTransfer.types)) return;
                e.preventDefault();
                if (!state.busy) dropMedia(e.dataTransfer);
              }}
            >
              <summary>
                <span>Notes & source</span>
                <span>
                  <Icon name="chevron" size={14} />
                </span>
              </summary>
              <fieldset className="arena-fields" disabled={state.busy}>
                <label className="arena-wide">
                  Comparison name
                  <input
                    value={draft.title}
                    maxLength={120}
                    onChange={(e) =>
                      state.edit({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label className="arena-wide">
                  Process & findings
                  <textarea
                    value={draft.notes}
                    maxLength={6000}
                    onChange={(e) =>
                      state.edit({ ...draft, notes: e.target.value })
                    }
                    placeholder="What changed between runs? What should we test next?"
                  />
                </label>
                <label>
                  Source duration (seconds)
                  <input
                    type="number"
                    min={0.01}
                    max={120}
                    step={0.01}
                    value={draft.sourceSeconds ?? ""}
                    onChange={(e) =>
                      state.edit({
                        ...draft,
                        sourceSeconds: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
              </fieldset>
            </details>
            <div className="arena-footer">
              <div className="arena-actions">
                <button
                  disabled={state.busy || draft.slots.length >= 4}
                  onClick={() =>
                    state.edit({
                      ...draft,
                      slots: [
                        ...draft.slots,
                        {
                          id: crypto.randomUUID().slice(0, 8),
                          label: "Approach 4",
                          model: "",
                          workflow: "",
                          guide: "",
                          prompt: "",
                          notes: "",
                          status: "draft",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" size={14} />
                  Approach
                </button>
                <button
                  disabled={state.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Permanently delete this comparison and all its uploaded files?",
                      )
                    )
                      void state.remove();
                  }}
                >
                  Delete comparison and files
                </button>
                <button onClick={() => arena && exportRecord(arena, draft)}>
                  Export record
                </button>
                <button
                  disabled={!state.dirty || state.busy}
                  onClick={() =>
                    void state.act(async () => {
                      await state.save();
                    })
                  }
                >
                  {state.dirty ? "Save changes" : "Saved"}
                </button>
              </div>
              <button
                className="primary-button"
                disabled={state.busy || agent.starting}
                onClick={() =>
                  void state.act(async () => {
                    const prompt = await arenaAgentPrompt(
                      "Prepare and run the approaches in this Arena comparison. Check the available workflow routes and ask for generation approval before spending. Record each result and assess motion, camera, identity and style independently.",
                    );
                    await agent.start({ source: "typed", prompt });
                  })
                }
              >
                {" "}
                {agent.starting ? "Opening agent…" : "Ask agent"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
          <details className="arena-connect">
            <summary>Agent connection</summary>
            <p>
              Use this comparison from MCP or CLI. A connection can read
              references and add results. Paid runs keep their own approval.
            </p>
            <button
              disabled={state.busy}
              onClick={() =>
                void state.act(async () => {
                  const saved = await state.save();
                  setCode(
                    (await arenaPost<{ code: string }>(`/${saved.id}/link`, {}))
                      .code,
                  );
                })
              }
            >
              Create one-use code
            </button>
            {code && <code>{code}</code>}
            <span>Only Ask agent includes this comparison automatically.</span>
          </details>
          <input
            hidden
            ref={referenceInput}
            type="file"
            accept="video/mp4,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void state.act(() => state.upload(file));
              e.target.value = "";
            }}
          />
        </>
      )}
      {active && enlarged && arena && (
        <ArenaLightbox
          arena={arena}
          slots={draft.slots.filter(
            (s) => enlarged === "all" || s.id === enlarged,
          )}
          title={
            enlarged === "all"
              ? draft.title
              : (draft.slots.find((s) => s.id === enlarged)?.label ??
                draft.title)
          }
          initialTime={playback.time}
          onClose={(time) => {
            playback.seek(time);
            setEnlarged(undefined);
          }}
        />
      )}
      {(state.error || agent.error || playback.error) && (
        <div className="arena-error" role="alert">
          {state.error || agent.error || playback.error}
          {state.error && arena && (
            <button onClick={() => void state.reload()}>
              Reload saved comparison
            </button>
          )}
        </div>
      )}
    </section>
  );
}
