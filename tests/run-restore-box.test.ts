import { describe, expect, it, vi } from "vitest";
import { RunRestorer, type RestoreIo } from "../src/run-restore";
import type { Job } from "../shared/types";

// Recreate restores the full saved setup: a run made on a GPU box goes back to
// that box (its name and tunnel port), never silently to Local, and a box that
// does not answer now is said in the notice.
const job = { id: "a", generator: "image", model: "flux-3-klein" } as Job;
const take = (box?: { name: string; url: string }) =>
  Response.json({
    take: {
      recipe: {
        id: "flux-3-klein",
        route: "workflow",
        workflow: "flux-3-klein-base-t2i",
        location: "local",
        ...(box ? { box } : {}),
      },
    },
  });
function io(response: Response, reachable = true) {
  const writes: unknown[] = [];
  const fake: RestoreIo = {
    readTake: async () => response,
    selectWorkflow: async () => {},
    saveRunLocation: async (location, box) => {
      writes.push(box ? { location, box } : location);
      return box
        ? {
            mode: "box",
            box: { ...box, url: "", status: { reachable } },
          }
        : { mode: location };
    },
  };
  return { fake, writes };
}

describe("Recreate on a GPU box run", () => {
  it("restores the box's name and port, not Local", async () => {
    const { fake, writes } = io(
      take({ name: "vast-5090", url: "http://127.0.0.1:18188" }),
    );
    const onError = vi.fn();
    await new RunRestorer(undefined, fake).restore(job, onError);
    expect(writes).toEqual([
      { location: "box", box: { name: "vast-5090", port: 18188 } },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("says when the box is not answering now", async () => {
    const { fake } = io(
      take({ name: "lab", url: "http://127.0.0.1:18190" }),
      false,
    );
    const onError = vi.fn();
    await new RunRestorer(undefined, fake).restore(job, onError);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("GPU box lab (port 18190) is not answering"),
    );
  });

  it("says so rather than switching to Local when the box cannot be restored", async () => {
    const { fake, writes } = io(take({ name: "lab", url: "http://example:1" }));
    const onError = vi.fn();
    await new RunRestorer(undefined, fake).restore(job, onError);
    expect(writes).toEqual([]);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("GPU box lab"),
    );
  });

  it("keeps a plain Local run on Local", async () => {
    const { fake, writes } = io(take());
    await new RunRestorer(undefined, fake).restore(job, vi.fn());
    expect(writes).toEqual(["local"]);
  });
});
