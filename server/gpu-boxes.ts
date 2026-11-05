import { LocalComfyWorkflows } from "./comfy-local";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import {
  boxIdle,
  boxUrl,
  DEFAULT_BOX_IDLE_MINUTES,
  type BoxStatus,
  type GpuBox,
} from "../shared/comfy/gpu-box";
import type { LocalModels } from "../shared/comfy/local-models";
import type { Fetcher } from "../shared/provider";

export interface GpuBoxesOptions {
  /** The model map local runs use, `GENOBI_LOCAL_MODELS`; boxes share it. */
  models?: LocalModels;
  fetcher?: Fetcher;
  /** Ports a box may not claim: this server's own. */
  reservedPorts?: readonly number[];
  /** `GENOBI_BOX_IDLE_MINUTES`: minutes with no job before the reminder. */
  idleMinutes?: number;
  now?: () => number;
}

/**
 * The GPU boxes this server has talked to: one local ComfyUI client per
 * tunnel port, and what the studio has seen of each, in memory only. A box is
 * a loopback ComfyUI, so every rule of `server/comfy-local.ts` holds: http to
 * 127.0.0.1 alone, no key sent, one submission, never retried.
 *
 * Uptime counts from the first answer this process saw and starts again
 * after the box stops answering. The idle reminder is only ever a reminder:
 * nothing here stops, pauses or calls a box's provider.
 */
export class GpuBoxes {
  private readonly clients = new Map<string, LocalComfyWorkflows>();
  private readonly seen = new Map<
    string,
    { upSince: string; lastJobAt: string | null }
  >();
  private readonly now: () => number;
  readonly idleMinutes: number;
  constructor(private readonly options: GpuBoxesOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idleMinutes =
      options.idleMinutes &&
      Number.isInteger(options.idleMinutes) &&
      options.idleMinutes > 0
        ? options.idleMinutes
        : DEFAULT_BOX_IDLE_MINUTES;
  }

  private stamp() {
    return new Date(this.now()).toISOString();
  }

  /**
   * The client for a box's loopback address, or undefined for anything that
   * is not `http://127.0.0.1:<port>` on a port this server does not use.
   */
  client(url: string): LocalComfyWorkflows | undefined {
    let parsed: URL;
    try {
      const destination = parseWorkflowDestination("local", url);
      if (destination.kind !== "local") return undefined;
      parsed = new URL(destination.url);
    } catch {
      return undefined;
    }
    const port = Number(parsed.port);
    if (
      parsed.hostname !== "127.0.0.1" ||
      parsed.pathname !== "/" ||
      !Number.isInteger(port) ||
      port < 1024 ||
      this.options.reservedPorts?.includes(port)
    )
      return undefined;
    const base = boxUrl(port);
    let client = this.clients.get(base);
    if (!client) {
      client = new LocalComfyWorkflows({
        url: base,
        models: this.options.models,
        fetcher: this.options.fetcher,
        label: "The GPU box",
        onSubmitted: () => this.noteJob(base),
      });
      this.clients.set(base, client);
    }
    return client;
  }

  /** The box client a stored handle or output URL names, if it is one. */
  owner(value: string): LocalComfyWorkflows | undefined {
    let origin: string;
    try {
      origin = new URL(value).origin;
    } catch {
      return undefined;
    }
    const client = this.client(origin);
    return client?.owns(value) ? client : undefined;
  }

  private noteJob(base: string) {
    const seen = this.seen.get(base);
    const at = this.stamp();
    this.seen.set(base, { upSince: seen?.upSince ?? at, lastJobAt: at });
  }

  /**
   * What the box reports, read free: `/system_stats`, and `/queue` so a long
   * render counts as work rather than idle time.
   */
  async status(box: GpuBox): Promise<BoxStatus> {
    const base = boxUrl(box.port);
    const client = this.client(base);
    const stats = client
      ? await client.stats()
      : { reachable: false, version: null, gpu: null, vramBytes: null };
    if (!stats.reachable) this.seen.delete(base);
    else {
      if (!this.seen.has(base))
        this.seen.set(base, { upSince: this.stamp(), lastJobAt: null });
      if (await client!.busy()) this.noteJob(base);
    }
    const seen = this.seen.get(base);
    const upSince = seen?.upSince ?? null;
    const lastJobAt = seen?.lastJobAt ?? null;
    return {
      ...stats,
      upSince,
      lastJobAt,
      idle: boxIdle(upSince, lastJobAt, this.idleMinutes, this.now()),
      idleMinutes: this.idleMinutes,
    };
  }
}
