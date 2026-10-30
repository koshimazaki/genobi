// `npm run favicon`: renders public/favicon.svg into the two raster icons
// browsers still ask for, so no page logs a favicon 404.
//
// - public/favicon.ico: one 32 px PNG inside an ICO container. Browsers have
//   read PNG entries in an ICO since Windows Vista, so no BMP encoder is
//   needed; the container is written by `icoFromPng` below.
// - public/apple-touch-icon.png: 180 px on the studio background, because iOS
//   fills a transparent touch icon with black.
//
// Rendering uses the Playwright Chromium the browser checks already install
// (`npx playwright install chromium`), so the build adds no dependency.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { icoFromPng } from "./lib/ico.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(root, "public");
/** `--bg` in src/styles/tokens.css. */
const BACKGROUND = "#101316";

async function render(page, svg, size, { background, inset }) {
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${background} }
    img { display: block; box-sizing: border-box; width: ${size}px; height: ${size}px; padding: ${inset}px }
  </style><img src="${source}">`);
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({
    type: "png",
    omitBackground: background === "transparent",
    clip: { x: 0, y: 0, width: size, height: size },
  });
}

const svg = await readFile(path.join(publicDirectory, "favicon.svg"), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const icon = await render(page, svg, 32, {
    background: "transparent",
    inset: 0,
  });
  await writeFile(
    path.join(publicDirectory, "favicon.ico"),
    icoFromPng(icon, 32),
  );
  const touch = await render(page, svg, 180, {
    background: BACKGROUND,
    inset: 22,
  });
  await writeFile(path.join(publicDirectory, "apple-touch-icon.png"), touch);
} finally {
  await browser.close();
}
console.log("Wrote public/favicon.ico and public/apple-touch-icon.png");
