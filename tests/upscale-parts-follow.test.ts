import { describe, expect, it, vi } from "vitest";
import { UpscalePartsService } from "../server/upscale-parts";
import { partsSetup, sent } from "./upscale-parts-harness";

describe("following split upscales after a part fails", () => {
  it("keeps reading until the other paid parts finish, without resending", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await app.parts.confirm(set.id, app.session, set.quoteId);
    app.store.data.partSets[0].followed = true;
    app.store.data.jobs[0].status = "Error";
    const partial = app.parts.list(app.session).sets[0];
    expect(partial.status).toBe("failed");
    expect(partial.parts[1].job?.status).toBe("Pending");
    const done = structuredClone(partial);
    done.parts[1].job!.status = "Ready";
    vi.useFakeTimers();
    try {
      const restarted = new UpscalePartsService(app.service, {} as never, 10);
      const read = vi
        .spyOn(restarted, "read")
        .mockResolvedValueOnce({ set: partial })
        .mockResolvedValue({ set: done });
      restarted.resumeFollowers();
      // Reopening a followed set must not create a competing polling loop.
      restarted.resumeFollowers();
      await vi.advanceTimersByTimeAsync(35);
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
    expect(sent(app)).toBe(2);
  });

  it("resumes an agent set after an explicitly confirmed retry", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await app.parts.confirm(set.id, app.session, set.quoteId);
    app.store.data.partSets[0].followed = true;
    app.store.data.jobs[0].status = "Error";
    app.store.data.jobs[1].status = "Error";
    const restarted = new UpscalePartsService(app.service, {} as never, 10);
    const { set: quoted } = await restarted.retry(set.id, 0, app.session);
    await restarted.confirmRetry(
      set.id,
      0,
      app.session,
      quoted.parts[0].retryQuote!.id,
    );
    const read = vi
      .spyOn(restarted, "read")
      .mockResolvedValue({ set: { status: "joined" } } as never);
    await vi.waitFor(() =>
      expect(read).toHaveBeenCalledWith(set.id, app.session),
    );
    expect(sent(app)).toBe(3);
  });
});
