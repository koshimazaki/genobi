// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { galleryTemplates, galleryMedia } from "../shared/gallery/catalogue";
import { galleryPage, embedMarkup } from "../shared/gallery/page";
import ShareLink from "../src/template-gallery/ShareLink";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each(galleryTemplates)(
  "serves public watch/embed pages for $name",
  (template) => {
    for (const route of ["watch", "embed"]) {
      const page = galleryPage(
        `/${route}/${template.id}`,
        "https://studio.test",
      )!;
      expect(page).toBeDefined();
      expect(page.body).toContain(template.name);
      expect(page.body).not.toContain("/api/");
      expect(page.headers["Content-Security-Policy"]).toContain(
        route === "embed" ? "frame-ancestors *" : "frame-ancestors 'none'",
      );
      const media = galleryMedia(template);
      if (media) {
        expect(page.body).toContain(`https://studio.test${media.poster}`);
        expect(existsSync(`public${media.poster}`)).toBe(true);
        expect(existsSync(`public${media.video}`)).toBe(true);
      } else {
        expect(page.body).toContain("Preview coming soon");
        expect(page.body).not.toContain("<video");
      }
    }
    expect(embedMarkup(template.id, "https://studio.test")).toContain(
      `/embed/${template.id}`,
    );
  },
);

function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root!.render(<ShareLink id="bloom-teaser" name="Bloom" />));
  return host;
}

it("copies the public watch URL and confirms beside the card's link icon", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    get: () => ({ writeText }),
  });
  const host = mount();
  await act(async () => host.querySelector("button")!.click());
  expect(writeText).toHaveBeenCalledWith(
    `${location.origin}/watch/bloom-teaser`,
  );
  expect(host.querySelector('[role="status"]')!.textContent).toBe(
    "Link copied",
  );
});

it("uses selected-text copy when the Clipboard API is absent", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    get: () => undefined,
  });
  const copy = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: copy,
  });
  const host = mount();
  await act(async () => host.querySelector("button")!.click());
  expect(copy).toHaveBeenCalledWith("copy");
  expect(host.textContent).toContain("Link copied");
});

it("keeps a selectable URL and working open-page link when both copy methods fail", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    get: () => ({ writeText: vi.fn().mockRejectedValue(new Error("Denied")) }),
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => false,
  });
  const host = mount();
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("input")!.value).toBe(
    `${location.origin}/watch/bloom-teaser`,
  );
  expect(host.querySelector("a")!.getAttribute("href")).toBe(
    "/watch/bloom-teaser",
  );
});
