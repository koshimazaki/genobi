import { chooseSelect } from "./lib/choose-select.mjs";
/** Local fixture-only UI check: no request reaches a real service or provider. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { overflow, names } from "./lib/a11y-audit.mjs";
const base = process.env.DIRECTOR_URL ?? "http://127.0.0.1:5397";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const output = ".local/taste-memory";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const library = JSON.parse(
  await readFile("public/media/gallery.json", "utf8"),
).map((s) => ({ ...s, origin: "sample" }));
const checks = [];
try {
  for (const width of process.env.MEMORY_WIDTHS
    ? process.env.MEMORY_WIDTHS.split(",").map(Number)
    : [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(10000);
    await page.addInitScript(() =>
      localStorage.setItem("genobi.startup-guide.v1", "seen"),
    );
    const errors = [];
    const decisionAttempts = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let profile = {
      schema: 1,
      revision: 0,
      preferences: [
        {
          id: "p",
          topic: "Pacing",
          value: "Gentle cuts",
          scope: { medium: "video", useCase: "tutorial" },
          evidence: [{ copyId: "project.copy", eventId: "evidence" }],
          author: "agent",
          status: "proposed",
        },
      ],
    };
    const context = {
      schema: 1,
      copyId: "project.copy",
      revision: 1,
      memoryRevision: 1,
      tasteRevision: 0,
      cursor: 1,
      checkpoint: null,
      events: [],
      decisions: [],
      sessions: [],
      references: [],
      taste: [],
      guidance: [],
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path.startsWith("/api/memory/")) {
        if (request.method() === "POST") {
          assert.equal(request.headers()["x-genobi-owner-action"], "1");
          const body = request.postDataJSON();
          if (path === "/api/memory/taste") {
            const held = profile.preferences.find((p) => p.id === body.id);
            assert(held);
            if (body.action === "delete") profile.preferences = [];
            else {
              Object.assign(
                held,
                body.edit ?? {},
                body.edit ? { author: "owner" } : {},
              );
              held.status = body.action === "activate" ? "active" : "disabled";
            }
            profile.revision++;
          } else if (path.endsWith("/decisions")) {
            assert.equal(body.source, "explicit-user");
            decisionAttempts.push(body.id);
            if (!context.decisions.some((e) => e.id === body.id)) {
              context.memoryRevision++;
              context.decisions.push({
                ...body,
                actor: "owner",
                revision: 1,
                cursor: ++context.cursor,
              });
            }
            if (decisionAttempts.length === 1)
              return route.abort("connectionfailed");
          } else if (path.endsWith("/taste")) {
            assert.equal(body.id, undefined);
            assert.match(body.preference.id, /^[a-f0-9-]{36}$/);
            profile.preferences.push({
              ...body.preference,
              author: "owner",
              status: "proposed",
            });
            context.tasteRevision = ++profile.revision;
          } else if (path.endsWith("/references")) {
            context.memoryRevision++;
            context.references.push({ ...body, inspected: false });
          } else if (path.endsWith("/forget")) {
            context.memoryRevision++;
            context.references = context.references.filter(
              (r) => r.id !== body.referenceId,
            );
          } else assert.fail(`Unexpected mutation ${path}`);
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({
          json: path === "/api/memory/taste" ? profile : context,
        });
      }
      if (request.method() !== "GET") return route.abort();
      return route.fulfill({
        json:
          path === "/api/health"
            ? { hasServerKey: false }
            : { jobs: [], sources: library },
      });
    });
    await page.goto(`${base}/taste`);
    await page
      .getByText("My reusable taste · local studio", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use for this scope", exact: true })
      .click();
    await page
      .getByText("video / tutorial · active · proposed by agent", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Edit Pacing", exact: true })
      .click();
    await page
      .getByLabel("Preference statement", { exact: true })
      .fill("Slow orbit for tutorials");
    await page
      .getByRole("button", { name: "Save and use preference", exact: true })
      .click();
    await page.getByText("Slow orbit for tutorials", { exact: true }).waitFor();
    assert.deepEqual(await overflow(page), []);
    assert.deepEqual(await names(page), []);
    const small = await page
      .locator(".memory-panel")
      .first()
      .locator(
        "button:visible, input:visible, textarea:visible, select:visible, summary:visible",
      )
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 43 || r.height < 43;
          })
          .map((el) => el.textContent),
      );
    assert.deepEqual(small, []);
    await page.screenshot({
      path: `${output}/taste-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Disable Pacing", exact: true })
      .click();
    await page
      .getByText("video / tutorial · disabled · proposed by owner", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Delete Pacing", exact: true })
      .click();
    await page
      .getByText("No reusable preferences yet.", { exact: false })
      .waitFor();
    await page.goto(base);
    await page
      .getByRole("navigation", { name: "Studio presets" })
      .getByRole("button", { name: "Editor", exact: true })
      .click();
    await page.getByText("Project memory & taste", { exact: true }).click();
    await chooseSelect(
      page.getByLabel("Decision", { exact: true }),
      "preference",
    );
    await page
      .getByLabel("Reason, if known", { exact: true })
      .fill("Slow orbit keeps the tutorial clear.");
    await page.getByLabel("Topic", { exact: true }).fill("camera");
    await page
      .getByLabel("Preference for this project", { exact: true })
      .fill("slow orbit");
    await page
      .getByRole("button", { name: "Record decision", exact: true })
      .click();
    await page.getByText("Failed to fetch", { exact: false }).waitFor();
    assert.equal(decisionAttempts.length, 1, "No automatic retry");
    await page
      .getByRole("button", { name: "Record decision", exact: true })
      .click();
    assert.equal(
      new Set(decisionAttempts).size,
      1,
      "An explicit retry reuses the event ID",
    );
    await page.getByText("camera: slow orbit", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Propose as reusable taste", exact: true })
      .click();
    assert.equal(profile.preferences.at(-1).status, "proposed");

    await page.getByText("References · 0", { exact: true }).click();
    await page
      .getByLabel("Source URL", { exact: true })
      .fill("https://example.org/scene");
    await page
      .getByLabel("Why this reference?", { exact: true })
      .fill("Orbit timing");
    await page
      .getByRole("button", { name: "Add reference", exact: true })
      .click();
    await page.getByText("Orbit timing", { exact: true }).waitFor();
    await page.getByText("Rights unknown", { exact: false }).waitFor();
    assert.deepEqual(await overflow(page), []);
    assert.deepEqual(await names(page), []);
    await page.screenshot({
      path: `${output}/project-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Remove reference", exact: true })
      .click();
    await page.getByText("References · 0", { exact: true }).waitFor();
    await page.route("**/api/memory/taste", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html>Local API unavailable</html>",
      }),
    );
    await page.goto(`${base}/taste`);
    await page
      .getByText("My reusable taste · local studio", { exact: true })
      .click();
    await page
      .getByText(
        "Project memory is available in the local studio. Save the project there first.",
        { exact: true },
      )
      .waitFor();
    assert.deepEqual(errors, []);
    checks.push({ width, passed: true });
    await page.close();
  }
  console.log(JSON.stringify(checks));
  await writeFile(`${output}/report.json`, JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
