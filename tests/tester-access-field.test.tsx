// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "test-only-code-for-the-form";
const TOKEN = "comfyui-tester.9999999999999.signature";
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubFetch(testerAccess: boolean, sent: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      sent.push(`${path} ${String(init?.body ?? "")}`);
      if (path === "/api/health")
        return Response.json({ ok: true, hasServerKey: false, testerAccess });
      if (path === "/api/tester/unlock")
        return Response.json({ token: TOKEN, runsLeft: 10, expiresAt: "" });
      if (path === "/api/tester/status")
        return Response.json({ runsLeft: 9, expiresAt: "" });
      return Response.json({}, { status: 404 });
    }),
  );
}
async function mount(value: string, onSave: (key: string) => void) {
  const { TesterAccessField } =
    await import("../src/components/TesterAccessField");
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<TesterAccessField value={value} onSave={onSave} />);
  });
  await act(async () => {});
  return host;
}

it("offers nothing unless health reports tester access", async () => {
  stubFetch(false, []);
  const host = await mount("", () => {});
  expect(host.textContent).toBe("");
});

it("sends the code once, keeps only the token and says the runs in words", async () => {
  const sent: string[] = [];
  stubFetch(true, sent);
  const saved: string[] = [];
  const host = await mount("", (key) => saved.push(key));
  expect(host.textContent).toContain(
    "Enter the access code from the submission",
  );
  const input = host.querySelector("input")!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, CODE);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
  expect(saved).toEqual([TOKEN]);
  expect(input.value).toBe("");
  expect(sent.filter((line) => line.includes(CODE))).toHaveLength(1);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(
    CODE,
  );
  // Once the page holds the token, the field shows the runs left as words.
  act(() => root?.unmount());
  const unlocked = await mount(TOKEN, () => {});
  expect(unlocked.textContent).toContain("Nine test runs left.");
});
