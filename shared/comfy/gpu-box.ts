import { AppError } from "../../server/errors";

/**
 * A GPU box: a ComfyUI on a rented Vast instance or the owner's lab machine,
 * reached through an SSH tunnel to this machine's loopback. It is a named
 * local destination with a port, not a new transport: the studio only ever
 * talks plain http to `127.0.0.1:<port>`, the rule PR #56 set for every
 * ComfyUI that is not on Comfy's own https hosts. The tunnel carries the bytes
 * the rest of the way, authenticated by the person's own SSH key, which the
 * studio never sees, stores or logs. Only the name and the local port are
 * kept; the SSH host the person types stays in their browser.
 */
export const DEFAULT_BOX_PORT = 8188;
/** The October 2026 Vast image ran ComfyUI on 18188 behind Caddy on 8188. */
export const VAST_IMAGE_PORT = 18188;
/** Minutes with no job before the studio suggests stopping the box. */
export const DEFAULT_BOX_IDLE_MINUTES = 20;
export const BOX_IDLE_REMINDER =
  "Vast bills by the hour; stop the box when done.";

export interface GpuBox {
  name: string;
  port: number;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;
const invalid = (message: string) =>
  new AppError(400, message, "invalid_destination");

/**
 * Reads a GPU box setting. The name is a label (1 to 40 letters, digits,
 * spaces, dots, dashes or underscores) with control characters stripped; the
 * port is the tunnel's local end, 1024 to 65535, never one this server
 * itself listens on. A refusal never repeats what was typed.
 */
export function parseGpuBox(
  value: unknown,
  reservedPorts: readonly number[] = [],
): GpuBox {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("Name the GPU box and its tunnel port.");
  const { name, port } = value as { name?: unknown; port?: unknown };
  const label =
    typeof name === "string" ? name.replace(/[\x00-\x1f\x7f]/g, "").trim() : "";
  if (!NAME.test(label))
    throw invalid(
      "A GPU box name is 1 to 40 letters, digits, spaces, dots, dashes or underscores.",
    );
  const number = typeof port === "string" && /^\d+$/.test(port) ? +port : port;
  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 1024 ||
    number > 65535
  )
    throw invalid("The tunnel port must be a whole number from 1024 to 65535.");
  if (reservedPorts.includes(number))
    throw invalid(
      "That port is the studio's own. Forward the box to another port, such as 8188.",
    );
  return { name: label, port: number };
}

/** The loopback address a box answers on: always plain http to 127.0.0.1. */
export const boxUrl = (port: number) => `http://127.0.0.1:${port}`;

/** What the person fills in to build the tunnel command; blanks stay placeholders. */
export interface TunnelInput {
  localPort?: number | string;
  remotePort?: number | string;
  /** `user@host` as the person typed it; never sent to the server. */
  target?: string;
  /** The SSH port Vast assigns to its proxy; omitted when blank. */
  sshPort?: number | string;
}

const PORT = /^\d{1,5}$/;
const TARGET = /^[A-Za-z0-9._-]{1,64}@[A-Za-z0-9.-]{1,253}$/;
const port = (value: unknown) =>
  value !== undefined && PORT.test(String(value).trim())
    ? String(value).trim()
    : undefined;

/**
 * `ssh -N [-p <ssh-port>] -L <port>:127.0.0.1:<remote-port> <user@host>`,
 * built from what was typed. Anything blank or malformed stays a placeholder,
 * so the command never carries a fragment a shell would read as more.
 */
export function tunnelCommand(input: TunnelInput = {}): string {
  const target = input.target?.trim() ?? "";
  const ssh = port(input.sshPort);
  return [
    "ssh -N",
    ...(ssh ? [`-p ${ssh}`] : []),
    `-L ${port(input.localPort) ?? "<port>"}:127.0.0.1:${port(input.remotePort) ?? "<remote-port>"}`,
    TARGET.test(target) ? target : "<user@host>",
  ].join(" ");
}

/** The GPU and its memory, where ComfyUI's `/system_stats` reports them. */
export interface BoxDevice {
  gpu: string | null;
  vramBytes: number | null;
}

/**
 * Reads the first device `/system_stats` lists. Only its name and total
 * memory are kept; ComfyUI's argv and paths are never read.
 */
export function boxDevice(stats: unknown): BoxDevice {
  const devices = (stats as { devices?: unknown } | null)?.devices;
  const first = Array.isArray(devices) ? devices[0] : undefined;
  const name = (first as { name?: unknown } | undefined)?.name;
  const vram = (first as { vram_total?: unknown } | undefined)?.vram_total;
  const gpu =
    typeof name === "string"
      ? name
          .replace(/[\x00-\x1f\x7f]/g, "")
          .slice(0, 96)
          .trim() || null
      : null;
  return {
    gpu,
    vramBytes:
      typeof vram === "number" && Number.isFinite(vram) && vram > 0
        ? vram
        : null,
  };
}

/** What the studio shows about a box beside its readiness. */
export interface BoxStatus extends BoxDevice {
  reachable: boolean;
  version: string | null;
  /** When the box first answered in this run of the studio. */
  upSince: string | null;
  /** When the studio last sent it a job, if it has. */
  lastJobAt: string | null;
  /** True once `idleMinutes` have passed with no job. */
  idle: boolean;
  idleMinutes: number;
}

/**
 * Whether to remind the person the box is idle: it answers, and neither a job
 * nor its first answer came within `idleMinutes`. It is only ever a reminder;
 * nothing stops a box.
 */
export function boxIdle(
  upSince: string | null,
  lastJobAt: string | null,
  idleMinutes: number,
  now = Date.now(),
): boolean {
  const up = Date.parse(upSince ?? "");
  if (!Number.isFinite(up)) return false;
  const job = Date.parse(lastJobAt ?? "");
  const last = Number.isFinite(job) ? Math.max(up, job) : up;
  return now - last >= idleMinutes * 60_000;
}

/** "2 h 05 min" from an ISO start, for the uptime line. */
export function uptime(upSince: string | null, now = Date.now()): string {
  const start = upSince ? Date.parse(upSince) : NaN;
  if (!Number.isFinite(start)) return "";
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours} h ${String(minutes % 60).padStart(2, "0")} min`
    : `${minutes} min`;
}
