import type { PartSetView } from "../shared/upscale-parts";
import { shouldPollParts } from "../shared/upscale-parts-poll";

/** One read loop per approved set, including while another part has failed. */
export class PartSetFollowers {
  private active = new Set<string>();
  constructor(private interval: number) {}

  start(id: string, read: () => Promise<{ set: PartSetView }>) {
    if (!this.interval || this.active.has(id)) return;
    this.active.add(id);
    let left = 1440; // Two hours at the default pace; never submits.
    const tick = async () => {
      const set = await read().then(
        (reply) => reply.set,
        () => undefined,
      );
      if (--left > 0 && (!set || shouldPollParts(set)))
        setTimeout(() => void tick(), this.interval).unref?.();
      else this.active.delete(id);
    };
    setTimeout(() => void tick(), this.interval).unref?.();
  }
}
