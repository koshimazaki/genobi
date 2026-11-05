// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { findMixTemplate } from "../shared/templates/catalogue";
import { galleryMedia, watchLink } from "../shared/gallery/catalogue";
import { galleryPage } from "../shared/gallery/page";
import TemplateDrawer from "../src/template-gallery/TemplateDrawer";

afterEach(() => vi.unstubAllGlobals());

const template = findMixTemplate("audio-reactive-drop")!;

it("links the drawer's share section to the public page in a new tab", () => {
  const html = renderToStaticMarkup(
    <TemplateDrawer
      template={template}
      onClose={() => {}}
      onGenerate={() => {}}
      onDirector={() => {}}
      onEditor={() => {}}
      busy=""
      error=""
      status=""
      session={false}
    />,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  const open = doc.querySelector<HTMLAnchorElement>(
    'a[aria-label="Open the public page"]',
  )!;
  expect(open).not.toBeNull();
  expect(open.getAttribute("href")).toBe(
    new URL(watchLink(template.id), location.origin).href,
  );
  expect(open.getAttribute("target")).toBe("_blank");
  expect(open.getAttribute("rel")).toBe("noopener");
  // Copy is still there, unchanged.
  expect(
    [...doc.querySelectorAll(".template-share-tabs button")].some(
      (b) => b.textContent === "Copy link",
    ),
  ).toBe(true);
});

it("puts a Genobi home mark above the player on the watch page only", () => {
  expect(galleryMedia(template)).toBeDefined();
  const read = (route: string) =>
    new DOMParser().parseFromString(
      galleryPage(`/${route}/${template.id}`, "https://studio.test")!.body,
      "text/html",
    );
  const watch = read("watch");
  const home = watch.querySelector<HTMLAnchorElement>(
    'main > header > a[aria-label="Genobi home"]',
  )!;
  expect(home.textContent).toBe("Genobi");
  expect(home.getAttribute("href")).toBe("https://studio.test/");
  expect(home.hasAttribute("target")).toBe(false);
  expect(home.nextElementSibling).toBeNull();
  expect(watch.querySelector("main > header + .player")).not.toBeNull();
  // The footer's own link is unchanged.
  expect(watch.querySelector("footer a.brand")?.getAttribute("target")).toBe(
    "_blank",
  );
  const embed = read("embed");
  expect(embed.querySelector('a[aria-label="Genobi home"]')).toBeNull();
  expect(embed.querySelector("main > header")).toBeNull();
});
