/**
 * The Editor's per-clip Send to Genobi, for `check-editor-regenerate.mjs`:
 * the button beside the CLIP INSPECTOR heading keeps the header one row at
 * the inspector's narrowest docked width and at 390 and 320 px; an empty
 * clip prompt is refused with a note; a written one starts one session with
 * that clip's words and says "Sent to Genobi · hh:mm"; and the Global
 * prompt's Send, with no global prompt, sends the clip prompts instead of
 * refusing. Agent routes are answered by the page (`open`), so nothing runs.
 */
import assert from "node:assert/strict";

/** Selects Orbit 1 and opens the inspector beside it. */
async function inspect(page) {
  await page
    .getByRole("button", { name: "Select Orbit 1", exact: true })
    .click();
  const show = page.getByRole("button", { name: "Show inspector" });
  if (await show.isVisible()) await show.click();
  const inspector = page.locator(".dir-inspector");
  await inspector.locator("header .dir-clip-send").waitFor();
  return inspector;
}

/** The header is one row: heading, Send and close share a line, nothing spills. */
async function oneRow(page, where) {
  const row = await page.evaluate(() => {
    const header = document.querySelector(".dir-inspector header");
    const [heading, send] = header.children;
    const close = header.querySelector('[aria-label="Close inspector"]');
    const box = (e) => e.getBoundingClientRect();
    const mid = (e) => box(e).top + box(e).height / 2;
    return {
      sameLine:
        Math.abs(mid(heading) - mid(send)) < 4 &&
        Math.abs(mid(send) - mid(close)) < 4,
      fits: header.scrollWidth <= header.clientWidth + 1,
      inside: box(close).right <= box(header).right + 1,
      label: send.textContent,
      height: box(send).height,
      widths: [...header.children].map((e) => Math.round(box(e).width)),
      header: [header.clientWidth, header.scrollWidth],
    };
  });
  assert.equal(row.label, "Send to Genobi", `Label at ${where}`);
  assert.ok(row.sameLine, `Heading, Send and close share one row at ${where}`);
  assert.ok(
    row.fits && row.inside,
    `The header does not spill at ${where}: ${JSON.stringify(row)}`,
  );
  assert.ok(row.height >= 20, `Send is a usable target at ${where}`);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    `No horizontal overflow at ${where}`,
  );
}

export async function clipSendChecks(open, checks, output) {
  // Layout: the narrowest docked inspector, then phone widths.
  {
    const { page } = await open(1440, true);
    await inspect(page);
    const resize = page.getByRole("separator", { name: "Inspector width" });
    await resize.focus();
    // Shift+arrow moves 64 px; the direction depends on the side it docks.
    for (const key of ["Shift+ArrowRight", "Shift+ArrowLeft"])
      for (let i = 0; i < 6; i++)
        if ((await resize.getAttribute("aria-valuenow")) !== "240")
          await page.keyboard.press(key);
    assert.equal(await resize.getAttribute("aria-valuenow"), "240");
    const width = await page
      .locator(".dir-inspector-drawer")
      .evaluate((e) => Math.round(e.getBoundingClientRect().width));
    assert.ok(width <= 241, `The inspector is at its narrowest (${width} px)`);
    await oneRow(page, `the ${width} px inspector`);
    await page
      .locator(".dir-inspector")
      .screenshot({ path: `${output}/clip-send-${width}.png` });
    await page.close();
    for (const phone of [390, 320]) {
      const { page } = await open(phone, true);
      await inspect(page);
      await oneRow(page, `${phone} px`);
      await page.screenshot({ path: `${output}/clip-send-${phone}.png` });
      await page.close();
    }
    checks.push(
      `Clip Send beside CLIP INSPECTOR: one row at ${width} px inspector, 390 and 320 px`,
    );
  }

  // Empty prompt: a note, nothing sent; written: that clip's words, once.
  {
    const { page, starts } = await open(1440, true);
    const inspector = await inspect(page);
    const send = inspector.locator("header .dir-clip-send");
    await send.click();
    await inspector
      .getByRole("alert")
      .getByText("Write this clip's prompt first", { exact: false })
      .waitFor();
    assert.equal(starts.length, 0, "An empty clip prompt sends nothing");
    await inspector
      .getByRole("textbox", { name: "Prompt", exact: true })
      .fill("Warm the first orbit, slow push-in");
    // Pressing Send takes the field's focus, which commits the words.
    await send.click();
    await inspector.getByText(/^Sent to Genobi · \d\d:\d\d$/).waitFor();
    assert.equal(starts.length, 1);
    assert.match(starts[0].prompt, /clip photo-1 "Orbit 1"/);
    assert.match(starts[0].prompt, /Warm the first orbit, slow push-in/);
    assert.match(starts[0].prompt, /Regenerate the linked Director project/);
    // Still editable after the send.
    assert.equal(
      await inspector
        .getByRole("textbox", { name: "Prompt", exact: true })
        .isEditable(),
      true,
    );
    await page
      .locator(".dir-inspector")
      .screenshot({ path: `${output}/clip-send-sent.png` });
    checks.push(
      "Clip Send: empty prompt refused with a note; written prompt sent once, Sent to Genobi shown",
    );
    await page.close();
  }

  // The Global prompt's Send with no global prompt sends the clip prompts.
  {
    const { page, starts } = await open(1440, true);
    const inspector = await inspect(page);
    await inspector
      .getByRole("textbox", { name: "Prompt", exact: true })
      .fill("Hold the orbit two beats longer");
    await page
      .getByRole("region", { name: "Project direction" })
      .getByRole("button", { name: "Send to Genobi", exact: true })
      .click();
    await inspector.getByText(/^Sent to Genobi · \d\d:\d\d$/).waitFor();
    assert.equal(starts.length, 1);
    assert.match(starts[0].prompt, /Follow the clip prompts saved/);
    assert.match(starts[0].prompt, /photo-1 "Orbit 1".*Hold the orbit/);
    checks.push(
      "Global Send with no global prompt: sends the clip prompts, marks the clip sent",
    );
    await page.close();
  }
}
