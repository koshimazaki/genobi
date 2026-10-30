import { emptySlots } from "../../shared/ltx-prompt";
import { emptyLight } from "../../shared/light";
import { useShell } from "../studio/ShellContext";
import { useGenerationBridge } from "./bridge";
import type { useScrolls } from "./useScrolls";
import { scrollHandoff } from "../../shared/scrolls/prompts";
import { saveScroll } from "./bundle";
import { download } from "../director/bundle";
export function ScrollHandoff({
  s,
  handoff,
  setHandoff,
}: {
  s: ReturnType<typeof useScrolls>;
  handoff: ReturnType<typeof scrollHandoff> | undefined;
  setHandoff: (value: undefined) => void;
}) {
  const d = s.bundle.document,
    bridge = useGenerationBridge(),
    shell = useShell();
  if (
    handoff &&
    (handoff.documentId !== d.id || handoff.revision !== d.revision)
  )
    return (
      <section className="scroll-handoff" role="alert">
        <p>
          The scroll changed. Prepare the selected guidance again to use the
          current media and timing.
        </p>
        <button onClick={() => setHandoff(undefined)}>
          Close outdated handoff
        </button>
      </section>
    );
  return (
    <>
      {handoff && (
        <section className="scroll-handoff" aria-label="Selected guidance">
          <div className="scroll-section-heading">
            <h3>
              {handoff.destination === "video"
                ? "Video guidance"
                : "Agent handoff"}
            </h3>
            <button onClick={() => setHandoff(undefined)}>Close</button>
          </div>
          <p>
            {handoff.assets.length} selected assets, with roles and shot order.{" "}
            {handoff.destination === "video"
              ? "The current video composer takes text; image conditioning needs a compatible workflow. Your references remain in the bundle."
              : "Save the bundle and handoff JSON for your agent. This does not resume a running agent session."}
          </p>
          <pre>{JSON.stringify(handoff, null, 2)}</pre>
          <div className="scroll-toolbar">
            <button
              onClick={() =>
                download(
                  new Blob([JSON.stringify(handoff, null, 2)], {
                    type: "application/json",
                  }),
                  `${d.id}-handoff.json`,
                )
              }
            >
              Save handoff JSON
            </button>
            <button onClick={() => saveScroll(s.bundle)}>
              Save media bundle
            </button>
            {handoff.destination === "video" && (
              <button
                onClick={() => {
                  if (!bridge) return;
                  const prompt = [
                    d.prompt,
                    ...handoff.cells.map(
                      (c) =>
                        `${c.title}: ${c.prompt}. ${c.camera}. ${c.action}.`,
                    ),
                  ].join("\n");
                  if (prompt.length > 1200) {
                    s.setMessage(
                      "This brief exceeds the video prompt limit. Shorten it or give the bundle to your agent for shot-by-shot planning.",
                    );
                    return;
                  }
                  bridge.update({
                    generator: "video",
                    model: "ltx-2.5",
                    description: prompt,
                    cameraEnabled: false,
                    slots: emptySlots,
                    light: emptyLight,
                    lightEdits: {},
                    acoustic: null,
                  });
                  shell?.select("camera");
                  setHandoff(undefined);
                }}
              >
                Open LTX with text only
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
