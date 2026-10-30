import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motionPreset, motionPresets, frameCount } from "./presets";
import { currentSection, snapshot } from "./snapshot";
import {
  loadConstruction,
  loadFrameClock,
  type ConstructionRun,
  type FrameClock,
} from "./runtime";
import "./motion-theme.css";
import "./motion-film.css";

export default function MotionTheme() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("ibm");
  const [ascii, setAscii] = useState(false);
  const [presetId, setPresetId] = useState("ui-build");
  const preset = motionPreset(presetId);
  const media = useRef<{
    render(ms: number, duration: number, reduced?: boolean): void;
    dispose(): void;
    setAscii?(value: boolean): void;
  } | null>(null);
  const assetSerial = useRef(0);
  const [assetName, setAssetName] = useState("");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("");
  const [message, setMessage] = useState("");
  const [frame, setFrame] = useState(0);
  const [capture, setCapture] = useState(false);
  const specimen = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const copies = useRef<HTMLElement[]>([]);
  const run = useRef<ConstructionRun | null>(null);
  const clock = useRef<FrameClock | null>(null);
  const raf = useRef(0);
  const frameRef = useRef(0);
  const serial = useRef(0);

  function stop() {
    serial.current += 1;
    run.current?.cancel();
    run.current = null;
    cancelAnimationFrame(raf.current);
    clock.current?.restore();
    clock.current = null;
  }
  function close() {
    stop();
    assetSerial.current += 1;
    media.current?.dispose();
    media.current = null;
    setOpen(false);
    setCapture(false);
  }
  useEffect(() => {
    const sync = () =>
      setEnabled(document.documentElement.dataset.theme === "signal");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);
  useEffect(() => {
    if (!enabled) {
      stop();
      setOpen(false);
    }
  }, [enabled]);
  function decorate(ms: number) {
    const el = film.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const glitch =
      !reduced && preset.glitches.some((t) => ms >= t && ms < t + 100);
    el.style.setProperty("--signal-break", glitch ? ".65" : "0");
    el.style.setProperty("--signal-shift", `${Math.sin(ms * 0.21) * 17}px`);
    el.style.setProperty(
      "--signal-progress",
      `${Math.min(1, ms / preset.durationMs)}`,
    );
    el.style.setProperty(
      "--signal-scale",
      String(reduced ? 1 : 0.97 + 0.03 * Math.min(1, ms / preset.durationMs)),
    );
    media.current?.render(ms, preset.durationMs, reduced);
    el.dataset.phase =
      ms < 1500
        ? "measure"
        : ms < 3100
          ? "trace"
          : ms < 4400
            ? "resolve"
            : "ready";
    const heading = el.querySelector("h1");
    if (heading) {
      const text = el.dataset.title ?? "";
      const count = reduced ? text.length : Math.floor(ms / 32);
      heading.textContent = text
        .split("")
        .map((c, i) =>
          i <= count || c === " " ? c : "01/#_"[(i + Math.floor(ms / 60)) % 5],
        )
        .join("");
    }
  }
  async function play(stepped = false) {
    stop();
    const token = serial.current;
    setMessage("");
    setCapture(stepped);
    frameRef.current = 0;
    setFrame(0);
    try {
      const api = await loadConstruction();
      await document.fonts.ready;
      if (token !== serial.current || !specimen.current) return;
      if (stepped) clock.current = await loadFrameClock();
      if (token !== serial.current) {
        clock.current?.restore();
        clock.current = null;
        return;
      }
      run.current = api.construct(specimen.current!, {
        mode: "skeleton-texts",
        duration: preset.buildMs,
        delay: 250,
        interactive: false,
        title: `genobi-${section}`,
        steps: preset.steps,
        done: "Ready to make it yours",
      });
      decorate(0);
      if (!stepped) {
        const start = performance.now();
        const tick = (now: number) => {
          decorate(now - start);
          if (now - start < preset.durationMs)
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start motion.",
      );
    }
  }
  function step() {
    if (!clock.current || frameRef.current >= frameCount(presetId) - 1) return;
    frameRef.current += 1;
    clock.current?.advance(1000 / 30);
    decorate((frameRef.current * 1000) / 30);
    setFrame(frameRef.current);
  }
  async function replaceAsset(file?: File) {
    if (!file || !specimen.current) return;
    stop();
    setCapture(false);
    const token = ++assetSerial.current;
    setMessage("Loading local asset…");
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("Choose an asset under 50 MB.");
      let element: HTMLElement;
      let controller: NonNullable<typeof media.current>;
      if (/\.glb$/i.test(file.name)) {
        controller = await (await import("./model-preview")).modelPreview(file);
        element = (
          controller as Awaited<
            ReturnType<typeof import("./model-preview").modelPreview>
          >
        ).element;
      } else {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
          throw new Error("Choose a PNG, JPEG, WebP or self-contained GLB.");
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.alt = "Selected character or product artwork";
        image.src = url;
        try {
          await image.decode();
        } catch {
          URL.revokeObjectURL(url);
          throw new Error("Could not decode that image.");
        }
        element = image;
        controller = {
          render() {},
          dispose() {
            URL.revokeObjectURL(url);
          },
        };
      }
      if (token !== assetSerial.current || !specimen.current) {
        controller.dispose();
        return;
      }
      media.current?.dispose();
      media.current = controller;
      controller.setAscii?.(ascii);
      const holder = document.createElement("div");
      holder.className = "motion-media";
      holder.append(element);
      specimen.current.replaceChildren(holder);
      controller.render(0, preset.durationMs);
      setAssetName(file.name);
      setMessage("Local asset ready. Replay to reveal it.");
    } catch (error) {
      if (token === assetSerial.current)
        setMessage(
          error instanceof Error ? error.message : "Could not open asset.",
        );
    }
  }
  function prepare() {
    const current = currentSection();
    if (!current.sources.length) {
      setMessage("Open a studio section first.");
      return;
    }
    restoreFocus.current = document.activeElement as HTMLElement;
    copies.current = current.sources.map(snapshot);
    setAssetName("");
    setSection(current.preset);
    setTitle(current.title);
    setOpen(true);
  }
  async function sampleCharacter() {
    try {
      const response = await fetch("/world-assets/AnimationLibrary.glb");
      if (!response.ok) throw new Error("Could not load sample character.");
      await replaceAsset(
        new File([await response.blob()], "Quaternius-animation-sample.glb"),
      );
    } catch {
      setMessage("Could not load sample character.");
    }
  }
  useEffect(() => {
    if (!open || !specimen.current) return;
    const root = document.getElementById("root");
    const previousInert = root?.inert;
    if (root) root.inert = true;
    const body = document.createElement("div");
    body.className = `motion-snapshot ${section === "scrolls" ? "scrolls" : ""}`;
    body.append(...copies.current);
    specimen.current.replaceChildren(body);
    const resize = () => {
      stop();
      body.style.zoom = "1";
      const width = specimen.current!.clientWidth;
      body.style.width = "1000px";
      body.style.zoom = String(
        Math.min(width / 1000, 550 / Math.max(1, body.scrollHeight)),
      );
    };
    resize();
    Promise.all(
      [...body.querySelectorAll("img")].map((img) =>
        img.decode().catch(() => {}),
      ),
    ).then(() => {
      if (body.isConnected) resize();
    });
    controls.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      if (root) root.inert = previousInert ?? false;
      restoreFocus.current?.focus({ preventScroll: true });
      assetSerial.current += 1;
      media.current?.dispose();
      media.current = null;
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [open, section]);
  if (!enabled) return null;
  return (
    <>
      <div className="motion-launch">
        <button onClick={prepare}>Build this view ↗</button>
        <a href="/motion/index.html">Motion library</a>
        {!open && message && <span role="status">{message}</span>}
      </div>
      {open &&
        createPortal(
          <div
            className="motion-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Construction motion study"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") close();
              if (e.key === "Tab") {
                const items = [
                  ...controls.current!.querySelectorAll<HTMLElement>(
                    "button,select,input,a[href]",
                  ),
                ].filter((el) => !el.hasAttribute("disabled"));
                const index = items.indexOf(
                  document.activeElement as HTMLElement,
                );
                if (
                  (e.shiftKey && index <= 0) ||
                  (!e.shiftKey && index === items.length - 1)
                ) {
                  e.preventDefault();
                  items[e.shiftKey ? items.length - 1 : 0]?.focus();
                }
              }
            }}
          >
            <div
              ref={film}
              className="motion-film"
              data-type={type}
              data-preset={presetId}
              data-title={title}
            >
              <header>
                <strong>genobi</strong>
                <span>SIGNAL / {preset.name.toUpperCase()}</span>
                <span>
                  {assetName
                    ? "LOCAL ASSET STUDY"
                    : `APP STUDY · ${section.toUpperCase()}`}
                </span>
              </header>
              <div className="motion-title">
                <p>{preset.kicker}</p>
                <h1 aria-label={title}>{title}</h1>
              </div>
              <div ref={specimen} className="motion-specimen" />
              <div className="motion-slices" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>RECONSTRUCT / SIGNAL</span>
              </div>
              <div className="motion-chapter">
                <span>{assetName ? "CHARACTER" : section.toUpperCase()}</span>
                <i />
                <span>STRUCTURE → STORY</span>
              </div>
              <footer>
                <span>
                  {assetName
                    ? "LOCAL ARTWORK / CHARACTER"
                    : "ACTUAL WORKSPACE · PREPARED EXAMPLE"}
                </span>
                <span>GENOBI × TRANSITIONS.DEV</span>
                <span>{preset.ending}</span>
              </footer>
            </div>
            <div ref={controls} className="motion-film-controls">
              <button onClick={() => void play()}>Replay build</button>
              <label>
                Preset{" "}
                <ThemedSelect
                  value={presetId}
                  onChange={(e) => {
                    stop();
                    setCapture(false);
                    setPresetId(e.target.value);
                  }}
                >
                  {motionPresets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                Title{" "}
                <input
                  value={title}
                  maxLength={60}
                  onChange={(e) => {
                    stop();
                    setCapture(false);
                    setTitle(e.target.value);
                  }}
                />
              </label>
              <label>
                Artwork / GLB{" "}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.glb"
                  onChange={(e) => {
                    void replaceAsset(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label>
                Typography{" "}
                <ThemedSelect
                  value={type}
                  onChange={(e) => {
                    stop();
                    setCapture(false);
                    setType(e.target.value);
                  }}
                >
                  <option value="ibm">IBM Plex Mono</option>
                  <option value="geist">Geist</option>
                  <option value="nokia">Nokia Cellphone · local</option>
                  <option value="retro">Retro Gaming · local</option>
                  <option value="explorers">Explorers · local</option>
                  <option value="arame">Arame · local</option>
                  <option value="instrument">Instrument Sans</option>
                </ThemedSelect>
              </label>
              <button onClick={() => void sampleCharacter()}>
                Load sample character
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={ascii}
                  onChange={(e) => {
                    stop();
                    setCapture(false);
                    setAscii(e.target.checked);
                    media.current?.setAscii?.(e.target.checked);
                    media.current?.render(0, preset.durationMs);
                  }}
                />
                ASCII · 3D assets
              </label>
              <button onClick={() => void play(true)}>Frame capture</button>
              {capture && (
                <>
                  <button
                    onClick={step}
                    disabled={frame >= frameCount(presetId) - 1}
                  >
                    Next frame
                  </button>
                  <output>Frame {frame}</output>
                </>
              )}
              <button onClick={close}>Back to studio</button>
              <span role="status">{message}</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
