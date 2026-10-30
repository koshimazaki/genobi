import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import Wordmark from "../src/components/Wordmark";

describe("the header names the studio the way the page does", () => {
  it("shows the product name in full, on one line, in its own case", async () => {
    const markup = renderToStaticMarkup(<Wordmark />);
    // The header said `flux studio lite` while the document title, the README
    // and the package all said FLUX Studio Lite. The visible name is the one
    // the page announces, so a rename has to reach both.
    expect(markup).toContain("Genobi");
    expect(markup).not.toContain("Camera Director");
    expect(markup).toContain('class="brand-mark"');
    const title = /<title>([^<]*)<\/title>/.exec(
      await readFile("index.html", "utf8"),
    )?.[1];
    expect(title).toBe("Genobi");
    expect(markup).toContain(`aria-label="${title} home"`);
  });

  it("keeps the mode tag a description of the mode, not a second name", () => {
    const markup = renderToStaticMarkup(<Wordmark />);
    expect(markup).toContain("Open-source video studio");
  });
});
