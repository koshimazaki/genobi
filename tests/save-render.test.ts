import { describe, expect, it, vi } from "vitest";
import { saveRender } from "../src/director/save-render";
import { UploadOutcomeUnknownError } from "../src/director/saved-media";
import type { AddedAsset } from "../src/studio/project-assets";

// Where a render lives: with the project copy locally; on the hosted site,
// with no copy, in the visitor's library first so a reload keeps it.
const blob = new Blob(["mp4"], { type: "video/mp4" });
const added: AddedAsset = {
  assetId: "asset-1",
  added: true,
  use: "production",
  filename: "Teaser.mp4",
};

describe("saving a render", () => {
  it("on the hosted site uploads to the library with the transient key, then adds it", async () => {
    const order: string[] = [];
    const upload = vi.fn(async () => {
      order.push("upload");
      return { source: {} } as never;
    });
    const add = vi.fn(async () => {
      order.push("add");
      return added;
    });
    const message = await saveRender({
      blob,
      name: "Teaser",
      copy: false,
      key: "page-key",
      add,
      upload,
    });
    expect(order).toEqual(["upload", "add"]);
    expect(upload).toHaveBeenCalledWith(blob, "Teaser", "page-key");
    expect(add).toHaveBeenCalledWith({
      blob,
      filename: "Teaser.mp4",
      use: "production",
    });
    expect(message).toMatch(/^Saved to your private library/);
    expect(message).toMatch(/until you reload/);
  });

  it("on the hosted site adds nothing when the library refuses, and never retries an uncertain upload", async () => {
    const add = vi.fn(async () => added);
    await expect(
      saveRender({
        blob,
        name: "Teaser",
        copy: false,
        key: "",
        add,
        upload: vi.fn().mockRejectedValue(new Error("Connect a key.")),
      }),
    ).rejects.toThrow("Connect a key.");
    const uncertain = vi
      .fn()
      .mockRejectedValue(new UploadOutcomeUnknownError("Upload server error."));
    await expect(
      saveRender({
        blob,
        name: "Teaser",
        copy: false,
        key: "",
        add,
        upload: uncertain,
      }),
    ).rejects.toThrow(/may already be saved/);
    expect(uncertain).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  it("locally adds to the project copy without an upload", async () => {
    const upload = vi.fn();
    const add = vi.fn(async () => added);
    const message = await saveRender({
      blob,
      name: "Teaser",
      copy: true,
      key: "page-key",
      add,
      upload,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledOnce();
    expect(message).toMatch(/kept with the project on this computer/);
  });
});
