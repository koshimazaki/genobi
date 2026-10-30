import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GenerateButton from "../src/components/GenerateButton";
import type { Job } from "../shared/types";
const render = (
  job?: Partial<Job>,
  hasKey = true,
  submitting = false,
  disabled = false,
) =>
  renderToStaticMarkup(
    <GenerateButton
      generator="video"
      activeJob={job as Job}
      hasKey={hasKey}
      submitting={submitting}
      disabled={disabled}
      onSubmit={() => {}}
      onResume={() => {}}
    />,
  );
describe("generation button lifecycle", () => {
  it("stays busy after submission until the paid job reaches a terminal state", () => {
    expect(render(undefined, true, true)).toContain('aria-busy="true"');
    for (const status of [
      "Pending",
      "Reasoning",
      "Generating",
      "copying",
    ] as const) {
      const html = render({ status, keyMode: "byo" });
      expect(html).toContain("generation-indicator");
    }
    for (const status of [
      "Ready",
      "Error",
      "expired",
      "stopped",
      "Request Moderated",
      "Content Moderated",
    ] as const) {
      const html = render({ status, keyMode: "byo" });
      expect(html).not.toContain('disabled=""');
      expect(html).not.toContain("generation-indicator");
    }
  });

  it("offers enabled credential resume instead of a new submission when a pending BYO job loses its key", () => {
    const html = render(
      { status: "Generating", keyMode: "byo" },
      false,
      false,
      true,
    );
    expect(html).toContain("Resume");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("generation-indicator");
  });

  // BFL exposes no way to call off a task, and credits are spent on success,
  // so a control here could only stop collecting a result already paid for.
  // The button goes quiet instead; the gallery's hide control is the way out.
  it("offers no way to call off a run that is already in flight", () => {
    for (const status of [
      "Pending",
      "Reasoning",
      "Generating",
      "copying",
    ] as const) {
      const html = render({ status, keyMode: "byo" });
      expect(html).toContain('disabled=""');
      expect(html).not.toMatch(/cancel/i);
      expect(html).not.toMatch(/stop/i);
    }
  });

  // The tooltip sits on a run in flight whatever runs it: an LTX Comfy Router
  // run is not a BFL run, so the wording must not name a provider or model.
  it("names no provider in the tooltip while a run is in flight", () => {
    for (const status of [
      "Pending",
      "Reasoning",
      "Generating",
      "copying",
    ] as const) {
      const html = render({ status, keyMode: "byo" });
      expect(html).toContain("This generation is still running");
      expect(html).not.toMatch(/\bBFL\b|\bComfy\b/);
    }
  });

  it("keeps sending disabled while a submission is in flight", () => {
    expect(render(undefined, true, true)).toContain('disabled=""');
  });
});
