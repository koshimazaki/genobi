// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import CaptureLayout from "../src/world-builder/CaptureLayout";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import { useLayoutTakeComposer } from "../src/useLayoutTakeComposer";
import { useLayoutTake, type CapturedLayout } from "../src/layout-take";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((close) => close());
  useLayoutTake.setState({ pending: undefined });
  vi.unstubAllGlobals();
});
function mount(render: () => React.ReactNode) {
  const host = document.createElement("div");
  const root = createRoot(host);
  const redraw = () => act(() => root.render(render()));
  redraw();
  cleanups.push(() => act(() => root.unmount()));
  return { host, redraw };
}

it("sets a compatible capture preset and sends only an existing take without uploading or generating", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const change = vi.fn();
  const send = vi.fn(async () => {});
  const s = {
    ready: true,
    busy: false,
    take: null,
    change,
    run: (fn: () => Promise<void>) => fn(),
  } as unknown as BuilderSession;
  const { host, redraw } = mount(() => <CaptureLayout s={s} send={send} />);
  const buttons = host.querySelectorAll("button");
  act(() => buttons[0].click());
  expect(change).toHaveBeenCalledWith({
    width: 1024,
    height: 576,
    frames: 193,
    seconds: 8,
  });
  expect(buttons[1].disabled).toBe(true);
  s.take = {} as NonNullable<BuilderSession["take"]>;
  redraw();
  await act(async () => buttons[1].click());
  expect(send).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
});

it("selects the combined workflow once for an explicit handoff, preserving later composer edits", () => {
  const update = vi.fn();
  const chosen = vi.fn();
  function Composer() {
    useLayoutTakeComposer(update, chosen);
    return null;
  }
  const { redraw } = mount(() => <Composer />);
  const take: CapturedLayout = {
    id: "first",
    name: "room",
    endpoint: "https://fixture.run.comfy.app",
    recipe: "{}",
    prompt: "My room",
    files: {},
  };
  act(() => useLayoutTake.setState({ pending: take }));
  expect(update).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: "ltx-deploy-layout-to-video",
      description: "My room",
      cameraEnabled: false,
    }),
  );
  redraw();
  expect(update).toHaveBeenCalledOnce();
  act(() =>
    useLayoutTake.setState({
      pending: { ...take, id: "second", prompt: "Another room" },
    }),
  );
  expect(update).toHaveBeenCalledTimes(2);
  expect(chosen).toHaveBeenCalledTimes(2);
});
