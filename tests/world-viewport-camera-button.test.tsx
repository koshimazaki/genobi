// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { ViewportLightbox } from "../src/world-builder/ViewportLightbox";
import { controlButton, mountWorldControl } from "./world-ui-harness";

it("opens the shared Camera panel beside Expand and releases the modal before it must be used", async () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
  const onCamera = vi.fn();
  const { host } = mountWorldControl(
    <ViewportLightbox onCamera={onCamera}>
      <canvas />
    </ViewportLightbox>,
  );
  const canvas = host.querySelector("canvas");
  await act(async () => controlButton(host, "Camera settings").click());
  expect(onCamera).toHaveBeenCalledOnce();
  await act(async () => controlButton(host, "Expand 3D scene").click());
  expect(host.querySelector("dialog")!.open).toBe(true);
  await act(async () => controlButton(host, "Camera settings").click());
  expect(host.querySelector("dialog")!.open).toBe(false);
  expect(host.querySelector("canvas")).toBe(canvas);
  expect(onCamera).toHaveBeenCalledTimes(2);
});
