// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import TemplateMediaInputs from "../src/director/TemplateMediaInputs";
import VersionMediaDrop from "../src/director/VersionMediaDrop";
import { versionSlots } from "../shared/templates/version";
import { characterPiece, dimensionsMix } from "../shared/templates/catalogue";
import {
  versionRequestedSlots,
  versionStudioUrl,
} from "../src/director/version-handoff";
import { readBrief, writeBrief } from "../src/director/prompt-brief";
import { versionPicks } from "../src/director/version-inputs";
import { readVersionBrief } from "../src/director/version-brief";
import { studioStore } from "../src/studio/store";
import { useStudio } from "../src/studio/useStudio";
import { versionCharacter, versionMix } from "./director-version-fixtures";
vi.mock("../src/studio/ShellContext", () => ({ useShell: () => null }));
vi.mock("../src/director/MediaTile", () => ({
  default: () => <span>Preview available</span>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let cleanup = () => {};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}
function drop(target: Element, files: File[], types = ["Files"]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { files, types, getData: () => "" },
  });
  target.dispatchEvent(event);
}
it("routes file drops and the chooser through one import and refuses URL-only/disabled drops", async () => {
  const bundle = await versionCharacter(),
    upload = vi.fn(async () => {});
  const slot = versionSlots(characterPiece)[0];
  const host = await mount(
    <VersionMediaDrop
      slot={slot}
      bundle={bundle}
      disabled={false}
      upload={upload}
    >
      Current image
    </VersionMediaDrop>,
  );
  const file = new NodeFile([new Uint8Array([1])], "test.png", {
    type: "image/png",
  }) as unknown as File;
  const target = host.querySelector(".dir-version-drop")!;
  await act(async () => {
    drop(target, [file]);
    drop(target, [file]);
  });
  expect(upload).toHaveBeenCalledExactlyOnceWith([file]);
  await act(async () => drop(target, [file], ["text/uri-list"]));
  expect(upload).toHaveBeenCalledTimes(1);
  const input = host.querySelector("input")!;
  // The labelled chooser button is the accessible control. Its backing file
  // input must not occupy an off-screen box and widen the modal or Director.
  expect(input.hidden).toBe(true);
  const click = vi.spyOn(input, "click");
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(click).toHaveBeenCalledOnce();
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(upload).toHaveBeenCalledTimes(2);
  cleanup();
  const blocked = await mount(
    <VersionMediaDrop slot={slot} bundle={bundle} disabled upload={upload}>
      Current image
    </VersionMediaDrop>,
  );
  await act(async () =>
    drop(blocked.querySelector(".dir-version-drop")!, [file]),
  );
  expect(upload).toHaveBeenCalledTimes(2);
});
it("commits an inline character replacement to the inputs generation reads, preserving custom brief/style and Undo", async () => {
  vi.stubGlobal("File", NodeFile);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 256, height: 256, close: vi.fn() }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No paid or remote call");
    }),
  );
  const original = await versionCharacter(),
    brief = readBrief(original);
  const bundle = writeBrief(original, {
    ...brief,
    text: `Character: [${brief.references[0].label}]\nStyle: hand-painted, keep red coat`,
  });
  studioStore.setState({
    director: { bundle, history: [], drafts: {} },
    operations: { playing: false, workingFile: false, rendering: false },
  });
  function Inputs() {
    const current = useStudio((s) => s.director.bundle)!;
    return <TemplateMediaInputs bundle={current} disabled={false} />;
  }
  const host = await mount(<Inputs />);
  const file = new NodeFile(
    [new Uint8Array(readFileSync("tests/fixtures/reference.png"))],
    "my-character.png",
    { type: "image/png" },
  ) as unknown as File;
  await act(async () => {
    drop(host.querySelector(".dir-version-drop")!, [file]);
    await vi.waitFor(() =>
      expect(studioStore.getState().director.bundle).not.toBe(bundle),
    );
  });
  const next = studioStore.getState().director.bundle!;
  const selected = versionPicks(next, characterPiece).character[0];
  expect(selected).not.toBe(brief.references[0].assetId);
  expect(next.project.assets[selected].origin).toBe("uploaded");
  expect(readBrief(next).text).toContain("hand-painted, keep red coat");
  expect(readBrief(next).references[0].assetId).toBe(selected);
  expect(fetch).not.toHaveBeenCalled();
  act(() => studioStore.getState().actions.undo());
  expect(
    versionPicks(studioStore.getState().director.bundle!, characterPiece)
      .character,
  ).toEqual([brief.references[0].assetId]);
});
it("opens the same local template/workspace with only declared generation choices and exposes editable template direction", async () => {
  const slots = versionSlots(dimensionsMix).map((s) => s.id);
  const url = new URL(
    versionStudioUrl(dimensionsMix.id, "editor", [slots[0], "unknown"]),
  );
  expect(url.pathname).toBe("/director");
  expect(url.searchParams.get("example")).toBe(dimensionsMix.id);
  expect(url.searchParams.get("workspace")).toBe("editor");
  expect(versionRequestedSlots(dimensionsMix.id, url.search)).toEqual([
    slots[0],
  ]);
  expect(url.href).not.toContain("unknown");
  const bundle = await versionMix();
  expect(readVersionBrief(bundle).text).toContain(
    `Look: ${dimensionsMix.style.look}`,
  );
  expect(
    readVersionBrief(
      writeBrief(bundle, {
        version: 1,
        text: "My own description",
        references: [],
      }),
    ).text,
  ).toBe("My own description");
});
