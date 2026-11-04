// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import VersionInputSlot from "../src/director/VersionInputSlot";
import { versionSlots } from "../shared/templates/version";
import { fruitsSwap } from "../shared/templates/fruits-swap";
import { dimensionsMix } from "../shared/templates/catalogue";
import type { HouseTemplate } from "../shared/templates/types";
import type { Bundle } from "../src/director/bundle";
vi.mock("../src/studio/ShellContext", () => ({ useShell: () => null }));
vi.mock("../src/director/MediaTile", () => ({
  default: () => <span>Preview available</span>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
afterEach(() => cleanup());

async function mountSlot(template: HouseTemplate, id: string) {
  const media = template.mix!.media[id];
  const bundle = {
    project: {
      id: template.id,
      template: { id: template.id, inputs: {} },
      assets: {
        [id]: {
          kind: media.kind,
          use: "production",
          file: { path: media.path, sha256: "a".repeat(64) },
          origin: "uploaded",
        },
      },
      generations: [],
      layers: [],
    },
    files: new Map(),
  } as unknown as Bundle;
  const slot = versionSlots(template).find((s) => s.id === id)!;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <VersionInputSlot
        slot={slot}
        bundle={bundle}
        ids={[id]}
        disabled={false}
        pick={() => {}}
        upload={async () => {}}
      />,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

it("shows the first still that made a template slot beside its media", async () => {
  const host = await mountSlot(fruitsSwap, "fruits-swap-pink-cat");
  const img = host.querySelector<HTMLImageElement>(
    ".dir-version-first-still img",
  )!;
  expect(img.getAttribute("src")).toBe(
    "/media/director-templates/fruits-swap/stills/fruits-swap-pink-cat.jpg",
  );
  expect(img.alt).toBe("First still that made fruits-swap-pink-cat");
  const guide = host.querySelectorAll<HTMLImageElement>(
    ".dir-version-first-still img",
  )[1];
  expect(guide.getAttribute("src")).toBe(
    "/media/director-templates/fruits-swap/stills/fruits-swap-mecha.jpg",
  );
  expect(host.querySelector("figcaption")?.textContent).toBe(
    "First still and its shape guide · char-pink-cat-explode",
  );
});

it("shows nothing for a slot that records no still", async () => {
  const id = Object.keys(dimensionsMix.mix!.media)[0];
  const host = await mountSlot(dimensionsMix, id);
  expect(host.querySelector(".dir-version-first-still")).toBeNull();
});
