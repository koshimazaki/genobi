// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ImageReferenceTray from "../src/components/ImageReferenceTray";
import { initialComposer, type ComposerState } from "../src/useComposer";
import {
  useImageReferences,
  type ImageReferences,
} from "../src/useImageReferences";
import type { VideoModel } from "../shared/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

function render(state: ComposerState) {
  const images = {
    loading: false,
    notice: "",
    add: vi.fn(async () => {}),
    drop: vi.fn(),
    remove: vi.fn(),
    earlier: vi.fn(),
    assign: vi.fn(),
  } as unknown as ImageReferences & { drop: ReturnType<typeof vi.fn> };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<ImageReferenceTray state={state} images={images} />));
  const tile = host.querySelector<HTMLButtonElement>(".image-add-reference")!;
  return { images, tile };
}

/** A file dragged from disk, as the browser dispatches it on the tile. */
function dragFile(target: Element) {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "sheet.jpg", {
    type: "image/jpeg",
  });
  const transfer = { files: [file], types: ["Files"], getData: () => "" };
  const fire = (type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    act(() => target.dispatchEvent(event));
    return event;
  };
  fire("dragenter");
  const over = fire("dragover");
  const drop = fire("drop");
  return { transfer, over, drop };
}

const image = (model: VideoModel, refs: string[] = []): ComposerState => ({
  ...initialComposer,
  generator: "image",
  model,
  imageReferences: refs,
});

it.each(["flux-3", "flux-3-klein-api", "flux-3-klein"] as VideoModel[])(
  "a file dropped on the Add / drop tile reaches the tray: %s",
  (model) => {
    const { images, tile } = render(image(model));
    expect(tile.textContent).toContain("Add / drop");
    expect(tile.disabled).toBe(false);
    const { transfer, over, drop } = dragFile(tile);
    expect(over.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(images.drop).toHaveBeenCalledOnce();
    expect(images.drop).toHaveBeenCalledWith(transfer);
  },
);

it("keeps the ten-image cap: the full tile is closed, a drop is refused", async () => {
  const ten = Array.from({ length: 10 }, () => "data:image/png;base64,");
  const { tile } = render(image("flux-3-klein", ten));
  expect(tile.disabled).toBe(true);
  // The tray hands the drop to the hook, which refuses an eleventh image.
  let hook: ImageReferences | undefined;
  const update = vi.fn();
  function Probe() {
    hook = useImageReferences(image("flux-3-klein", ten), update);
    return <p>{hook.notice}</p>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const probe = createRoot(host);
  act(() => probe.render(<Probe />));
  await act(() =>
    hook!.add([
      new File([new Uint8Array([1])], "x.png", { type: "image/png" }),
    ]),
  );
  expect(host.textContent).toContain("Up to 10 images");
  expect(update).not.toHaveBeenCalled();
  act(() => probe.unmount());
});
