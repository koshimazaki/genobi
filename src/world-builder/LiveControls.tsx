import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { connectWorld } from "./agent-bridge";
import { inComfyNode } from "./host";
import { motionLabel } from "../scene3d/creature-slots";
import { useWorldLink } from "./world-link";
export function LiveControls({
  s,
  e,
  active = false,
}: {
  s: BuilderSession;
  e: WorldEditor;
  /** World Builder is on screen: the studio's running session is granted. */
  active?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const link = useWorldLink(s, active, (onDisconnect) =>
    connectWorld(s.api.current!, onDisconnect),
  );
  const { code, connected, granted } = link.state;
  useEffect(() => {
    const timer = setInterval(
      () => setRecording(!!s.api.current?.live.status().recording),
      250,
    );
    return () => {
      clearInterval(timer);
    };
  }, [s.api]);
  return (
    <div
      className="wb-live-controls"
      role="group"
      aria-label="Live character and recording"
    >
      {e.mode === "walk" && (
        <>
          {(["jump", "ninja", "spell", "backflip"] as const).map((action) => (
            <button
              key={action}
              disabled={
                s.busy ||
                (action !== "jump" &&
                  !s.api.current?.live.status().motions.includes(action))
              }
              onClick={() => {
                s.runtime.current?.editor?.action(action);
                s.canvas.current?.focus();
              }}
            >
              {action === "jump"
                ? "Jump · Space"
                : `${motionLabel(action)} · ${action === "ninja" ? 1 : action === "spell" ? 2 : 3}`}
            </button>
          ))}
          <ThemedSelect
            aria-label="Walking camera"
            defaultValue="follow"
            onChange={(ev) =>
              s.run(() =>
                s.api.current!.live.control({
                  camera: ev.target.value,
                  seconds: 1,
                }),
              )
            }
          >
            <option value="follow">Follow camera</option>
            <option value="orbit">Orbit camera</option>
            <option value="shot">Shot camera move</option>
          </ThemedSelect>
        </>
      )}
      {(e.mode === "walk" || recording) && (
        <button
          disabled={s.busy}
          onClick={() =>
            s.run(async () => {
              if (recording) await s.api.current!.live.stopRecording();
              else await s.api.current!.live.startRecording();
              setRecording(!recording);
            })
          }
        >
          {recording ? "Stop recording" : "Record live · up to 30s"}
        </button>
      )}
      {/* Inside Comfy an agent reaches the node through the graph, so the
          studio's pairing link is not offered there. */}
      {!inComfyNode() && (
        <>
          <button
            disabled={!s.ready || s.busy}
            onClick={() => s.run(link.toggle)}
          >
            {connected ? "Disconnect agents" : "Connect agents"}
          </button>
          {granted && !code && (
            <span role="status">Linked to the running agent session</span>
          )}
          {code && (
            <label>
              Pairing code{" "}
              <input
                aria-label="World pairing code"
                readOnly
                value={code}
                onFocus={(ev) => ev.target.select()}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
