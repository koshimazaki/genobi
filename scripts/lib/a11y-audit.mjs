/**
 * Mechanical accessibility probes for the phone/a11y browser check. Each
 * returns a list of problems; an empty list means the probe passed.
 */

const interactiveRoles = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "listbox",
  "option",
  "slider",
  "spinbutton",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "treeitem",
]);

/** Document wider than the viewport means the page scrolls sideways. */
export async function overflow(page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
  }));
  return scroll <= width + 1
    ? []
    : [`document scrollWidth ${scroll}px > viewport ${width}px`];
}

/** Chrome's own computed accessible names, from the full accessibility tree. */
export async function names(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const unnamed = nodes.filter(
      (n) =>
        !n.ignored &&
        interactiveRoles.has(n.role?.value) &&
        !String(n.name?.value ?? "").trim(),
    );
    const problems = [];
    for (const node of unnamed) {
      let label = `${node.role.value}`;
      if (node.backendDOMNodeId) {
        const { node: dom } = await cdp
          .send("DOM.describeNode", { backendNodeId: node.backendDOMNodeId })
          .catch(() => ({ node: null }));
        if (dom) {
          const attrs = Object.fromEntries(
            (dom.attributes ?? []).flatMap((v, i, all) =>
              i % 2 ? [] : [[v, all[i + 1]]],
            ),
          );
          label += ` <${dom.localName}${attrs.class ? `.${attrs.class.split(" ")[0]}` : ""}${attrs.id ? `#${attrs.id}` : ""}${attrs.type ? ` type=${attrs.type}` : ""}>`;
        }
      }
      problems.push(`no accessible name: ${label}`);
    }
    return problems;
  } finally {
    await cdp.detach();
  }
}

/**
 * WCAG 2.2 target size (minimum): 24×24 CSS px, or undersized targets whose
 * 24 px circles neither touch another target nor another undersized circle.
 * Inline links in running text are exempt.
 */
export async function targets(page) {
  return page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"], [tabindex]:not([tabindex="-1"])';
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false; // visually hidden input
      if (el.closest("[hidden], [inert]")) return false;
      // Closed <details> content keeps a box but is not rendered.
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      const s = getComputedStyle(el);
      if (s.visibility !== "visible" || Number(s.opacity) === 0) return false;
      // Only targets a visitor can actually reach in the current layout.
      return r.bottom > -scrollY && r.right > 0 && r.left < innerWidth;
    };
    // Content behind a modal dialog is inert; only the dialog is in reach.
    const scope = document.querySelector("dialog:modal") ?? document;
    const all = [...scope.querySelectorAll(selector)].filter(shown);
    const inline = (el) =>
      el.tagName === "A" &&
      getComputedStyle(el).display === "inline" &&
      el.parentElement?.closest("p, li");
    const items = all.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        el,
        r,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        small: (r.width < 24 || r.height < 24) && !inline(el),
      };
    });
    const related = (a, b) => a.el.contains(b.el) || b.el.contains(a.el);
    const circleHitsRect = (a, r) => {
      const x = Math.max(r.left, Math.min(a.cx, r.right));
      const y = Math.max(r.top, Math.min(a.cy, r.bottom));
      return (a.cx - x) ** 2 + (a.cy - y) ** 2 < 144;
    };
    const describe = (el) =>
      (
        el.getAttribute("aria-label") ||
        [...(el.labels ?? [])]
          .map((l) => l.textContent)
          .join(" ")
          .trim() ||
        el.textContent.trim() ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        el.tagName
      )
        .replace(/\s+/g, " ")
        .slice(0, 40);
    return items
      .filter((a) => a.small)
      .flatMap((a) => {
        const near = items.find(
          (b) =>
            b !== a &&
            !related(a, b) &&
            (circleHitsRect(a, b.r) ||
              (b.small && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 24)),
        );
        return near
          ? [
              `target ${Math.round(a.r.width)}×${Math.round(a.r.height)} ${a.el.tagName.toLowerCase()} "${describe(a.el)}" is under 24 px and crowds "${describe(near.el)}"`,
            ]
          : [];
      });
  });
}

/**
 * Tab through the page; each stop must look different focused than unfocused
 * (outline, shadow, border, background, colour or underline on the element,
 * its parent, its labels or its next sibling, for visually hidden inputs).
 */
export async function focusWalk(page, { limit = 120 } = {}) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.__focusTrail = [];
    window.__focusLook = (e) => {
      const s = getComputedStyle(e);
      return [
        s.outlineStyle === "none"
          ? "none"
          : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        s.boxShadow,
        s.borderColor,
        s.backgroundColor,
        s.color,
        s.textDecorationLine,
      ].join("|");
    };
  });
  const seen = new Set();
  let bodies = 0;
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      const look = window.__focusLook;
      const related = [
        el,
        el.parentElement,
        el.nextElementSibling,
        ...(el.labels ?? []),
      ].filter(Boolean);
      window.__focusTrail.push({
        el,
        related,
        focused: related.map(look),
        name: (
          el.getAttribute("aria-label") ||
          el.textContent.trim() ||
          el.getAttribute("title") ||
          el.tagName
        )
          .replace(/\s+/g, " ")
          .slice(0, 40),
      });
      if (!el.dataset.focusId)
        el.dataset.focusId = String(window.__focusTrail.length);
      return el.dataset.focusId;
    });
    // A modal dialog passes focus to the browser once per cycle.
    if (key === "body") {
      if (++bodies > 1) break;
      continue;
    }
    if (seen.has(key)) break;
    seen.add(key);
  }
  return page.evaluate(() => {
    // Native video controls focus an inner browser element. Blurring the video
    // host alone can leave that focus in place, invalidating the baseline.
    const reset = document.querySelector("dialog:modal") ?? document.body;
    const tabindex = reset.getAttribute("tabindex");
    reset.setAttribute("tabindex", "-1");
    reset.focus({ preventScroll: true });
    if (tabindex === null) reset.removeAttribute("tabindex");
    else reset.setAttribute("tabindex", tabindex);
    const look = window.__focusLook;
    const trail = window.__focusTrail.filter(
      (t, i, all) => all.findIndex((o) => o.el === t.el) === i,
    );
    document
      .querySelectorAll("[data-focus-id]")
      .forEach((el) => delete el.dataset.focusId);
    const problems = trail
      .filter((t) => t.el.isConnected)
      .filter((t) => {
        // A scrollable dialog can itself be a tab stop. It is also our reset
        // target, so move focus to a child before measuring its unfocused look.
        if (t.el === reset) {
          const other = trail.find(
            (item) => item.el !== reset && item.el.isConnected,
          );
          other?.el.focus({ preventScroll: true });
          const unchanged = t.related.every((e, i) => look(e) === t.focused[i]);
          reset.focus({ preventScroll: true });
          return unchanged;
        }
        return t.related.every((e, i) => look(e) === t.focused[i]);
      })
      .map(
        (t) => `no visible focus: ${t.el.tagName.toLowerCase()} "${t.name}"`,
      );
    return { stops: trail.length, problems };
  });
}

/** Animations still running once a reduced-motion page has settled. */
export async function runningMotion(page) {
  return page.evaluate(() => [
    ...document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map(
        (a) =>
          `animation running under reduced motion: ${a.animationName ?? a.transitionProperty ?? "script"} on ${a.effect?.target?.className || a.effect?.target?.tagName}`,
      ),
    ...[...document.querySelectorAll("video")]
      .filter((v) => !v.paused && v.getClientRects().length)
      .map(
        (v) =>
          `video playing on its own under reduced motion: ${v.src.split("/").at(-1)}`,
      ),
  ]);
}

/** Visible canvases that keep repainting on their own (script-driven motion). */
export async function movingCanvases(page, gap = 700) {
  const canvases = await page.locator("canvas").all();
  const problems = [];
  for (const canvas of canvases) {
    const box = await canvas.boundingBox();
    if (!box || box.width * box.height < 10000 || !(await canvas.isVisible()))
      continue;
    const label =
      (await canvas.getAttribute("aria-label")) ??
      (await canvas.evaluate((c) => c.parentElement?.className ?? "canvas"));
    await canvas.scrollIntoViewIfNeeded();
    const before = await canvas.screenshot({ animations: "allow" });
    await page.waitForTimeout(gap);
    const after = await canvas.screenshot({ animations: "allow" });
    if (!before.equals(after))
      problems.push(`canvas keeps moving under reduced motion: ${label}`);
  }
  return problems;
}
