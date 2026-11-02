// How it was made lists in-progress work first, then finished versions by
// number, newest first, even when a hand-kept record is out of order.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("../src/director/showcase", () => ({
  showcaseForTemplate: () => ({
    project: "demo",
    template: "demo",
    versions: [
      { version: 2, title: "Second", date: "2026-10-02", summary: "b" },
      { version: 1, title: "First", date: "2026-10-01", summary: "a" },
      { version: 3, title: "Third", date: "2026-10-03", summary: "c" },
    ],
    pending: [{ version: 4, summary: "next" }],
  }),
}));

it("puts pending first, then finished versions newest first", async () => {
  const { default: ShowcaseVersions } =
    await import("../src/template-gallery/ShowcaseVersions");
  const html = renderToStaticMarkup(<ShowcaseVersions template="demo" />);
  const order = [...html.matchAll(/<strong>v(\d+) ·/g)].map((m) =>
    Number(m[1]),
  );
  expect(order).toEqual([4, 3, 2, 1]);
  expect(html).toMatch(/v3 · Third · latest/);
  expect(html.match(/ · latest/g)).toHaveLength(1);
});
