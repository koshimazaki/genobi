// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CloudWorkflowCheck } from "../src/components/CloudWorkflowCheck";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const report = {
  templates: [{ id: "example", label: "Example workflow" }],
  cloud: {
    destination: "cloud",
    note: "Metadata only; execution remains unverified.",
    templates: {
      example: {
        status: "unknown",
        missingNodes: [],
        missingModels: [],
        unknownNodes: [],
        unknownModels: ["lora_name"],
      },
    },
  },
};
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (
  apiKey = "comfyui-ui-fixture",
  connectionRevision = "1",
) => {
  await act(async () =>
    root.render(
      <CloudWorkflowCheck
        apiKey={apiKey}
        connectionRevision={connectionRevision}
      />,
    ),
  );
};

it("checks only after a click and displays unknown availability without a ready claim", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(report));
  vi.stubGlobal("fetch", fetcher);
  await render();
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => host.querySelector("button")!.click());
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe("/api/settings/workflows?check=cloud");
  expect(fetcher.mock.calls[0][1]?.headers).toEqual({
    "x-byo-key": "comfyui-ui-fixture",
  });
  expect(host.textContent).toContain("Availability incomplete");
  expect(host.textContent).toContain("Not verified: lora_name");
  expect(host.textContent).not.toContain("ready");
});

it("clears account evidence and ignores a late response when the connection changes", async () => {
  let answer!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  await render();
  await act(async () => host.querySelector("button")!.click());
  const signal = fetcher.mock.calls[0][1]?.signal;
  await render("comfyui-other-fixture", "2");
  expect(signal?.aborted).toBe(true);
  await act(async () => answer(Response.json(report)));
  expect(host.querySelector("details")).toBeNull();
  expect(host.textContent).not.toContain("catalogue checked");
  expect(host.querySelector("button")!.disabled).toBe(false);
  expect(fetcher).toHaveBeenCalledOnce();
});
