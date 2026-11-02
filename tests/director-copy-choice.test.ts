import { describe, expect, it, vi } from "vitest";
import { copyChoice } from "../src/director/project-copy-choice";
import type { Bundle } from "../src/director/bundle";

const bundle = (revision: number) =>
  ({ project: { id: "p", revision } }) as unknown as Bundle;

function choice(state: {
  overwrittenAt?: number;
  revision: number;
  local: number;
  server: number;
  latest: number | undefined;
}) {
  const accept = vi.fn(),
    restore = vi.fn(),
    notice = vi.fn(),
    reoffer = vi.fn();
  const made = copyChoice({
    id: "p",
    revision: 4,
    kind: "saved-copy",
    overwrittenAt: state.overwrittenAt ?? 2,
    current: () => bundle(state.revision),
    synced: () => ({ local: state.local, server: state.server }),
    latest: () => state.latest,
    accept,
    notice,
    reoffer,
    restore,
  });
  return { made, accept, restore, notice, reoffer };
}

describe("the saved-copy choice", () => {
  it("keeps the saved copy for the replacement it was asked about", () => {
    const { made, accept } = choice({
      revision: 4,
      local: 4,
      server: 4,
      latest: 2,
    });
    made.keepTheirs!();
    expect(accept).toHaveBeenCalledOnce();
  });

  it("does not accept once a newer replacement happened", () => {
    const { made, accept } = choice({
      revision: 4,
      local: 4,
      server: 4,
      latest: 3,
    });
    made.keepTheirs!();
    expect(accept).not.toHaveBeenCalled();
  });

  it("an older offer cannot settle a newer replacement; the newest can", () => {
    const older = choice({
      overwrittenAt: 1,
      revision: 4,
      local: 4,
      server: 4,
      latest: 2,
    });
    older.made.keepTheirs!();
    expect(older.accept).not.toHaveBeenCalled();
    const newest = choice({ revision: 4, local: 4, server: 4, latest: 2 });
    newest.made.keepTheirs!();
    expect(newest.accept).toHaveBeenCalledOnce();
  });

  it("does nothing when this project has nothing left to settle", () => {
    const { made, accept } = choice({
      revision: 4,
      local: 4,
      server: 4,
      latest: undefined,
    });
    made.keepTheirs!();
    expect(accept).not.toHaveBeenCalled();
  });

  it("refuses to restore an older draft over newer edits", () => {
    const { made, restore, notice } = choice({
      revision: 5,
      local: 4,
      server: 4,
      latest: 2,
    });
    made.keepMine();
    expect(restore).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(
      "Project changed; review before restoring an older draft.",
    );
  });

  it("asks again when the server moved on", () => {
    const { made, restore, reoffer } = choice({
      revision: 4,
      local: 4,
      server: 5,
      latest: 2,
    });
    made.keepMine();
    expect(restore).not.toHaveBeenCalled();
    expect(reoffer).toHaveBeenCalledOnce();
  });
});
