const configuration = JSON.parse(
  document.querySelector("#configuration").textContent,
);

if (window.parent !== window) document.body.classList.add("embedded");
const roles = {
  developer: {
    name: "Developer",
    purpose: "Diagnose and repair reproducible issues",
  },
  creative: {
    name: "Creative",
    purpose: "Exercise creative workflows and review outputs",
  },
};
document.querySelector(".studio-link").href = configuration.studioOrigins[0];
const panels = document.querySelector("#panels");
let paused = false,
  busy = false;
let subscription = null,
  lastSnapshot = null;
const parentOrigins = new Set(configuration.studioOrigins);
function publishPresence(data) {
  if (!subscription || !data) return;
  const actors = data.profiles.map((p) => {
    const update = [...p.events]
      .reverse()
      .find(
        (e) =>
          e.kind === "assistant" &&
          e.text &&
          !e.text.startsWith("User asked (deterministic"),
      );
    return {
      id: p.session,
      role: p.role === "developer" ? "Developer" : "Creative",
      runtime: "Hermes",
      model: String(p.model || "").slice(0, 120),
      state: p.running ? "connected" : "stopped",
      summary: (update?.text || "")
        .replace(/[\x00-\x1f\x7f]+/g, " ")
        .slice(0, 240),
    };
  });
  window.parent.postMessage(
    {
      type: "genobi.supervisor.snapshot",
      channel: subscription.channel,
      actors,
    },
    subscription.origin,
  );
}
window.addEventListener("message", (event) => {
  if (
    event.source !== window.parent ||
    !parentOrigins.has(event.origin) ||
    event.data?.type !== "genobi.supervisor.subscribe" ||
    typeof event.data.channel !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(event.data.channel)
  )
    return;
  subscription = { origin: event.origin, channel: event.data.channel };
  const allowed = [
    "--bg",
    "--panel",
    "--line",
    "--muted",
    "--text",
    "--accent",
    "--blue",
    "--button-ink",
    "--chip-bg",
    "--chip-border",
    "--chip-text",
    "--scrollbar",
  ];
  for (const key of allowed) {
    const value = event.data.theme?.[key];
    if (
      typeof value === "string" &&
      value.length < 100 &&
      CSS.supports("color", value)
    )
      document.documentElement.style.setProperty(key, value);
  }
  if (lastSnapshot && Date.now() / 1000 - lastSnapshot.now < 10)
    publishPresence(lastSnapshot);
});
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function followLatest(feed) {
  if (paused || !document.querySelector("#follow").checked) return;
  requestAnimationFrame(() => {
    if (!paused && document.querySelector("#follow").checked)
      feed.scrollTop = feed.scrollHeight;
  });
}
// Hidden Development frames may receive events before they have any height.
const feedSizes = new ResizeObserver((entries) => {
  for (const entry of entries)
    if (entry.contentRect.height > 0) followLatest(entry.target);
});
for (const [role, info] of Object.entries(roles)) {
  const panel = el("section", "panel");
  panel.dataset.role = role;
  const top = el("div", "panel-top");
  const row = el("div", "row");
  row.append(el("h2", "", info.name), el("span", "status", "Connecting"));
  top.append(row, el("div", "session", ""), el("p", "purpose", info.purpose));
  const studioLink = el("a", "panel-link", "Open Genobi ↗");
  studioLink.href = configuration.studioOrigins[0];
  studioLink.target = "_blank";
  studioLink.rel = "noopener noreferrer";
  studioLink.title =
    "Studio home. This does not attach to the agent’s isolated browser.";
  top.append(studioLink);
  const feed = el("div", "feed");
  panel.append(top, feed);
  panels.append(panel);
  feedSizes.observe(feed);
}
function safeLink(value) {
  try {
    if (value.includes("[query") || value.includes("[redacted]")) return null;
    const url = new URL(value.replaceAll("&amp;", "&"));
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function linkedText(text) {
  const pre = el("pre");
  const pattern =
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|<a\b[^>]*\bhref=["'](https?:\/\/[^"'<>]+)["'][^>]*>([^<]*)<\/a>|https?:\/\/[^\s<>"'`]+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    pre.append(document.createTextNode(text.slice(cursor, match.index)));
    let url = match[2] || match[3] || match[0],
      label = match[1] || match[4] || url,
      tail = "";
    if (!match[2] && !match[3]) {
      const stripped = url.replace(/[.,;!]+$/, "");
      tail = url.slice(stripped.length);
      url = stripped;
      while (
        url.endsWith(")") &&
        (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length
      ) {
        tail = ")" + tail;
        url = url.slice(0, -1);
      }
      label = url;
    }
    const href = safeLink(url);
    if (href) {
      const a = el("a", "", label);
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      pre.append(a, document.createTextNode(tail));
    } else pre.append(document.createTextNode(match[0]));
    cursor = match.index + match[0].length;
  }
  pre.append(document.createTextNode(text.slice(cursor)));
  return pre;
}
function eventNode(e) {
  const node = el("article", "event " + e.kind);
  node.dataset.id = e.id;
  const meta = el("div", "meta");
  meta.append(
    el(
      "span",
      "who",
      e.kind === "user"
        ? "Instruction"
        : e.kind === "tool"
          ? "Tool result"
          : "Hermes",
    ),
  );
  meta.append(
    el(
      "time",
      "",
      e.time
        ? new Date(e.time * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "",
    ),
  );
  node.append(meta);
  if (e.text) {
    if (e.kind === "user" && e.text.length > 600) {
      const details = el("details");
      details.append(
        el("summary", "", e.text.split("\n")[0].slice(0, 120)),
        linkedText(e.text),
      );
      node.append(details);
    } else node.append(linkedText(e.text));
  }
  if (e.truncated)
    node.append(el("p", "sub", "Message truncated in this viewer."));
  if (e.tools.length) {
    const tags = el("div", "tools");
    for (const name of e.tools) tags.append(el("span", "chip", name));
    node.append(tags);
  }
  return node;
}
function render(data) {
  if (data.budget) {
    const b = data.budget;
    document.querySelector("#budget").textContent =
      "Comfy: " +
      b.confirmedSpend +
      " spent / " +
      b.maximum +
      " credits · " +
      b.reserved +
      " reserved" +
      (b.uncertain ? " · " + b.uncertain + " uncertain" : "");
  } else
    document.querySelector("#budget").textContent = "Budget not configured";
  for (const p of data.profiles) {
    const panel = document.querySelector('[data-role="' + p.role + '"]');
    const status = panel.querySelector(".status");
    const age = p.lastEventAt
      ? Math.max(0, Math.round(data.now - p.lastEventAt))
      : null;
    status.textContent =
      (p.running ? "Process running" : "Process stopped") +
      (age === null
        ? ""
        : " · event " +
          (age < 60 ? age + "s" : Math.floor(age / 60) + "m") +
          " ago");
    status.classList.toggle("running", p.running);
    panel.querySelector(".session").textContent =
      (p.model || "Hermes") + " · " + p.session;
    const feed = panel.querySelector(".feed");
    if (p.error) {
      feed.replaceChildren(el("p", "error", p.error));
      continue;
    }
    const ids = new Set(p.events.map((e) => String(e.id)));
    for (const old of feed.querySelectorAll(".event"))
      if (!ids.has(old.dataset.id)) old.remove();
    feed.querySelector(".empty")?.remove();
    let changed = false;
    for (const event of p.events) {
      if (!feed.querySelector('[data-id="' + event.id + '"]')) {
        feed.append(eventNode(event));
        changed = true;
      }
    }
    if (!p.events.length)
      feed.append(el("div", "empty", "Waiting for saved session activity…"));
    if (changed) followLatest(feed);
  }
}
async function poll() {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    if (!response.ok) throw Error("HTTP " + response.status);
    const data = await response.json();
    lastSnapshot = data;
    publishPresence(data);
    if (!paused) {
      render(data);
      const s = document.querySelector("#connection");
      s.textContent = "● LIVE · " + new Date().toLocaleTimeString();
      s.className = "connection";
    }
  } catch {
    const s = document.querySelector("#connection");
    s.textContent = "Disconnected · retrying";
    s.className = "connection error";
  } finally {
    busy = false;
  }
}
document.querySelector("#pause").onclick = () => {
  paused = !paused;
  document.querySelector("#pause").textContent = paused
    ? "Resume view"
    : "Pause view";
  if (paused)
    document.querySelector("#connection").textContent =
      "View paused · agents continue";
  else poll();
};
document.querySelector("#follow").onchange = () =>
  document.querySelectorAll(".feed").forEach(followLatest);
document.querySelector("#tools").onchange = (e) => {
  document.body.classList.toggle("hidden-tools", !e.target.checked);
  document.querySelectorAll(".feed").forEach(followLatest);
};
poll();
setInterval(poll, 2000);
