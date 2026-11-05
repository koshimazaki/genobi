import "../styles/gpu-box.css";
import { useEffect, useState } from "react";
import type { RunLocationState } from "../../shared/comfy/run-location";
import {
  DEFAULT_BOX_PORT,
  VAST_IMAGE_PORT,
  boxUrl,
  tunnelCommand,
} from "../../shared/comfy/gpu-box";
import { readLocalCheck } from "../local-check";
import type { LocalCheck } from "../run-mode";
import { boxReadiness } from "../gpu-box-view";
import { copyText } from "../template-gallery/copy-text";
import { useLiveBoxStatus } from "../box-status";

interface Props {
  state: RunLocationState;
  /** True while the session runs on this box. */
  active: boolean;
  saving: boolean;
  onUse(box: { name: string; port: number }): void;
}

/**
 * The GPU box panel: a Vast instance or the lab machine, reached through an
 * SSH tunnel the person runs themselves. Only the box's label and the
 * tunnel's local port are saved on the server; the SSH host, user and remote
 * port stay in this panel's memory to build the command, and never leave the
 * browser. The studio never stops a box: the idle line only reminds.
 */
export default function GpuBoxField({ state, active, saving, onUse }: Props) {
  const [name, setName] = useState(state.box?.name ?? "");
  const [port, setPort] = useState(String(state.box?.port ?? DEFAULT_BOX_PORT));
  const [remotePort, setRemotePort] = useState("");
  const [target, setTarget] = useState("");
  const [sshPort, setSshPort] = useState("");
  const [copied, setCopied] = useState("");
  const [check, setCheck] = useState<LocalCheck | null>(null);
  // Live, not from the settings answer: its revision does not move when the
  // tunnel comes up or the box goes idle (`src/box-status.ts`).
  const live = useLiveBoxStatus(active, String(state.box?.port ?? ""));
  const status = live ?? state.box?.status ?? null;
  const reachable = Boolean(status?.reachable);
  const command = tunnelCommand({
    localPort: port,
    remotePort,
    target,
    sshPort,
  });
  const portNumber = /^\d{4,5}$/.test(port.trim()) ? Number(port) : NaN;
  const usable =
    name.trim().length > 0 &&
    Number.isInteger(portNumber) &&
    portNumber >= 1024 &&
    portNumber <= 65535;

  useEffect(() => {
    if (!active) {
      setCheck(null);
      return;
    }
    let current = true;
    void readLocalCheck(`box-${state.revision}-${reachable}`).then((answer) => {
      if (current) setCheck(answer);
    });
    return () => {
      current = false;
    };
  }, [active, state.revision, reachable]);

  const box = state.box;
  const view = active && box ? boxReadiness(status, check, box.url) : undefined;
  return (
    <div className="gpu-box" aria-label="GPU box">
      <p className="run-location__note">
        A GPU box is ComfyUI on a Vast instance or your lab machine. Forward it
        to this machine with SSH, then run on it like a local ComfyUI. Genobi
        keeps only the name and port; your SSH key and host never reach it.
      </p>
      <div className="gpu-box__fields">
        <label>
          Box name
          <input
            value={name}
            maxLength={40}
            placeholder="vast-5090"
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
          />
        </label>
        <label>
          Local port
          <input
            inputMode="numeric"
            value={port}
            placeholder={String(DEFAULT_BOX_PORT)}
            onChange={(event) => setPort(event.target.value)}
            disabled={saving}
          />
        </label>
        <label>
          Box ComfyUI port
          <input
            inputMode="numeric"
            value={remotePort}
            placeholder={`${DEFAULT_BOX_PORT} (${VAST_IMAGE_PORT} on the October Vast image)`}
            onChange={(event) => setRemotePort(event.target.value)}
          />
        </label>
        <label>
          SSH user@host
          <input
            value={target}
            autoComplete="off"
            spellCheck={false}
            placeholder="root@ssh5.vast.ai"
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <label>
          SSH port (Vast)
          <input
            inputMode="numeric"
            value={sshPort}
            placeholder="optional"
            onChange={(event) => setSshPort(event.target.value)}
          />
        </label>
      </div>
      <div className="gpu-box__command">
        <code>{command}</code>
        <button
          type="button"
          onClick={() =>
            void copyText(command).then((ok) =>
              setCopied(ok ? "Copied." : "Select the command to copy it."),
            )
          }
        >
          Copy
        </button>
      </div>
      <p className="run-location__note" aria-live="polite">
        {copied ||
          `Run it in a terminal and leave it open. Placeholders in <> are yours to fill in.`}
      </p>
      <button
        type="button"
        disabled={saving || !usable}
        onClick={() => onUse({ name: name.trim(), port: portNumber })}
      >
        {active ? "Update GPU box" : "Use this GPU box"}
      </button>
      {view && box && (
        <div
          className={`gpu-box__status gpu-box__status--${view.state}`}
          role="status"
        >
          <strong>
            {box.name} · {boxUrl(box.port)}
          </strong>
          <span>{view.headline}</span>
          {view.device && <span>{view.device}</span>}
          {view.uptime && <span>{view.uptime}</span>}
          {view.gaps.map((gap) => (
            <span key={gap} className="gpu-box__gap">
              {gap}
            </span>
          ))}
          {view.idle && <span className="gpu-box__idle">{view.idle}</span>}
        </div>
      )}
    </div>
  );
}
