import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import UpscaleSplit from "../src/components/UpscaleSplit";
import { AppError } from "../server/errors";
import { cutParts } from "../server/upscale-media";
import { UpscalePartsService } from "../server/upscale-parts";
import type { MediaTools } from "../server/media-tools";
import type { Store, StoredSource } from "../server/store";
import {
  partKey,
  planParts,
  singleRunSeconds,
  splitOffer,
} from "../shared/upscale-parts";
import type { GenerateInput, Source } from "../shared/types";
import { partsSetup, sent } from "./upscale-parts-harness";

// What a split upscale does after things go wrong: a restart in the middle of
// a retry, a cut that fails half way, followers after a restart; and which
// split the composer offers for the model and run location.

describe("a retry claim no process holds", () => {
  it("is settled after a restart: the part retries and is sent once", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    const submit = app.bfl.submit.bind(app.bfl);
    vi.spyOn(app.bfl, "submit").mockImplementation(async (...args) => {
      if (app.bfl.submissions === 1) {
        app.bfl.submissions++;
        throw new AppError(502, "Submission uncertain.", "submission_unknown");
      }
      return submit(...args);
    });
    await app.parts.confirm(set.id, app.session, set.quoteId);
    const { set: quoted } = await app.parts.retry(set.id, 1, app.session);
    const retryQuote = quoted.parts[1].retryQuote!.id;
    // The server stopped after storing the claim, before any reservation.
    const part = app.store.data.partSets[0].parts[1];
    part.retry = { quoteId: retryQuote, claimId: "stale", from: 0 };
    part.attempt = 1;
    expect(sent(app)).toBe(2);
    const restarted = new UpscalePartsService(app.service, {} as never, 0);
    const { set: retried } = await restarted.confirmRetry(
      set.id,
      1,
      app.session,
      retryQuote,
    );
    expect(sent(app)).toBe(3);
    expect(retried.parts[1].job?.status).toBe("Pending");
    expect(
      app.store.data.jobs.filter((job) =>
        job.idempotencyKey.startsWith(`parts-${set.id}-1-`),
      ),
    ).toHaveLength(2);
    expect(app.store.data.jobs.map((job) => job.idempotencyKey)).toContain(
      partKey(set.id, 1, 1),
    );
    // Its quote is spent: it cannot send the part again.
    await expect(
      restarted.confirmRetry(set.id, 1, app.session, retryQuote),
    ).rejects.toBeInstanceOf(AppError);
    expect(sent(app)).toBe(3);
  });

  it("keeps a run reserved under the claim, and never resends it", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await app.parts.confirm(set.id, app.session, set.quoteId);
    // The second part's run was reserved and then died with the server.
    const job = app.store.data.jobs.find(
      (item) => item.idempotencyKey === partKey(set.id, 1, 0),
    )!;
    job.status = "Error";
    delete job.providerId;
    const part = app.store.data.partSets[0].parts[1];
    part.retry = { quoteId: crypto.randomUUID(), claimId: "stale", from: 0 };
    const restarted = new UpscalePartsService(app.service, {} as never, 0);
    // Settled: the claim goes, the run stays, and a retry needs a new quote.
    const { set: quoted } = await restarted.retry(set.id, 1, app.session);
    expect(quoted.parts[1].uncertain).toBe(true);
    expect(quoted.parts[1].retryQuote).toBeDefined();
    expect(sent(app)).toBe(2);
  });
});

describe("a cut that fails half way", () => {
  it("takes back the parts already made, files included", async () => {
    const sources: StoredSource[] = [];
    const store = {
      data: { sources, quotes: [] },
      save: async () => {},
    } as unknown as Store;
    let made = 0;
    const tools = {
      store,
      probeFile: async () => ({ duration: 23 }),
      produce: async () => {
        if (++made === 2) throw new AppError(422, "ffmpeg failed.");
        const source = {
          id: `cut-${made}`,
          filePath: `/nonexistent/cut-${made}.mp4`,
        } as StoredSource;
        sources.push(source);
        return source as Source;
      },
    } as unknown as Pick<MediaTools, "probeFile" | "produce" | "store">;
    await expect(
      cutParts(
        tools,
        { source: { id: "mix", label: "Mix" } as Source, file: "/in.mp4" },
        planParts(555, 24),
        "session",
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(store.data.sources).toHaveLength(0);
  });
});

describe("followers after a restart", () => {
  it("follow again only approved, unfinished agent sets", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    await app.parts.confirm(set.id, app.session, set.quoteId);
    const stored = app.store.data.partSets[0];
    stored.followed = true;
    vi.useFakeTimers();
    try {
      const restarted = new UpscalePartsService(app.service, {} as never, 10);
      // Answered as joined, so the follower stops after one read.
      const read = vi
        .spyOn(restarted, "read")
        .mockResolvedValue({ set: { status: "joined" } } as never);
      restarted.resumeFollowers();
      await vi.advanceTimersByTimeAsync(15);
      expect(read).toHaveBeenCalledWith(set.id, app.session);
      stored.joinedSourceId = "joined";
      read.mockClear();
      restarted.resumeFollowers();
      await vi.advanceTimersByTimeAsync(15);
      expect(read).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    expect(sent(app)).toBe(2);
  });
});

describe("an approved set interrupted while sending", () => {
  it("is already marked for following before any part is sent", async () => {
    const app = await partsSetup();
    const { set } = await app.parts.plan(app.request, app.session);
    // The server stops in the middle of sending: the marker must already
    // be stored with the confirmation, so a restart resumes the set.
    const service = app.parts as unknown as {
      send: (...args: unknown[]) => Promise<void>;
    };
    vi.spyOn(service, "send").mockRejectedValue(new Error("stopped"));
    await expect(
      app.parts.confirm(set.id, app.session, set.quoteId, undefined, {
        payer: "server",
      } as never),
    ).rejects.toThrow("stopped");
    const stored = app.store.data.partSets[0];
    expect(stored.confirmation).toBeDefined();
    expect(stored.followed).toBe(true);
  });
});

describe("the composer's offer", () => {
  it("depends on the model and the run location", () => {
    const clip = { duration: 23.125 };
    expect(singleRunSeconds("seedvr2-upscale", "local")).toBe(120);
    expect(singleRunSeconds("seedvr2-upscale", "cloud")).toBe(20);
    expect(singleRunSeconds("flux-3", "local")).toBe(20);
    expect(splitOffer(clip, "seedvr2-upscale", "local")).toBe("optional");
    expect(splitOffer(clip, "seedvr2-upscale", "cloud")).toBe("required");
    expect(splitOffer(clip, "flux-3", undefined)).toBe("required");
    expect(splitOffer({ duration: 150 }, "seedvr2-upscale", "local")).toBe(
      "required",
    );
    expect(splitOffer({ duration: 12 }, "flux-3", "cloud")).toBeUndefined();
    const optional = renderToStaticMarkup(
      <UpscaleSplit
        input={{} as GenerateInput}
        source={{ duration: 23.125 } as Source}
        apiKey=""
        refresh={async () => {}}
        optional
      />,
    );
    expect(optional).not.toContain("too long");
    expect(optional).toContain("Upscale in parts");
  });
});
