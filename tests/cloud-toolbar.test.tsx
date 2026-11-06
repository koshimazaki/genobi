// @vitest-environment jsdom
import { expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ComposerToolbar from "../src/components/ComposerToolbar";
import { initialComposer } from "../src/useComposer";
import { useSettingsStore } from "../src/settings-store";
import { CLOUD_GPU_ESTIMATE } from "../shared/quote";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it("labels a Cloud Klein estimate as GPU time rather than a fixed API price", () => {
  const before = useSettingsStore.getState().location;
  useSettingsStore.setState({ location: "cloud" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (model: "flux-3-klein" | "flux-3-klein-api") =>
    act(() =>
      root.render(
        <ComposerToolbar
          state={{ ...initialComposer, generator: "image", model }}
          update={() => {}}
          estimate={0.01}
          estimateCredits={null}
          action={null}
        />,
      ),
    );
  try {
    render("flux-3-klein");
    expect(host.querySelector(".cost")?.textContent).toContain(
      "EST. GPU TIME / RUN",
    );
    expect(host.querySelector(".cost")?.getAttribute("title")).toBe(
      CLOUD_GPU_ESTIMATE,
    );
    render("flux-3-klein-api");
    expect(host.querySelector(".cost")?.textContent).not.toContain("GPU TIME");
  } finally {
    act(() => root.unmount());
    host.remove();
    useSettingsStore.setState({ location: before });
  }
});
