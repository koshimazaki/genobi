const selectors: Record<string, string[]> = {
  scrolls: [".scroll-header", ".scroll-workbench", ".scroll-composer"],
  gallery: [".template-gallery"],
  camera: ['[data-panel="preview"]', '[data-panel="composer"]'],
  director: ['[data-panel="stage"]'],
  editor: ['[data-panel="stage"]', '[data-panel="timeline"]'],
  world: ['[data-panel="world"]'],
  scene3d: ['[data-panel="scene3d"]'],
  dual: ['[data-panel="dual"]'],
  tools: ['[data-panel="tools"]'],
};
export function currentSection() {
  const preset =
    document.querySelector<HTMLElement>(".genobi-shell")?.dataset.preset ??
    "gallery";
  const sources = (selectors[preset] ?? [".genobi-panel:not([hidden])"])
    .flatMap((selector) => [
      ...document.querySelectorAll<HTMLElement>(selector),
    ])
    .filter((el) => el.getBoundingClientRect().width > 0);
  const kind =
    document.querySelector<HTMLElement>(".scroll-paper")?.dataset.kind;
  const title =
    preset === "scrolls"
      ? kind === "character"
        ? "Define a character."
        : "Shape the story."
      : ({
          gallery: "Find your beginning.",
          camera: "Direct the feeling.",
          director: "Make it yours.",
          editor: "Find the rhythm.",
          world: "Build the world.",
          scene3d: "Build the world.",
          dual: "Choose the moment.",
        }[preset] ?? "Make your next move.");
  return { preset, sources, title };
}
export function snapshot(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((el, i) => {
    const copy = copies[i];
    copy.removeAttribute("id");
    copy.removeAttribute("autofocus");
    if (el instanceof HTMLInputElement)
      (copy as HTMLInputElement).value = el.value;
    if (el instanceof HTMLTextAreaElement)
      (copy as HTMLTextAreaElement).value = el.value;
    if (el instanceof HTMLSelectElement)
      (copy as HTMLSelectElement).value = el.value;
    if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
      const canvas = document.createElement("canvas");
      canvas.width = el instanceof HTMLCanvasElement ? el.width : el.videoWidth;
      canvas.height =
        el instanceof HTMLCanvasElement ? el.height : el.videoHeight;
      if (canvas.width && canvas.height) {
        try {
          canvas.getContext("2d")?.drawImage(el, 0, 0);
          const img = document.createElement("img");
          img.src = canvas.toDataURL();
          img.alt = "Current preview frame";
          img.style.cssText = `width:100%;height:${el.getBoundingClientRect().height}px;object-fit:contain;display:block`;
          copy.replaceWith(img);
        } catch {
          copy.remove();
        }
      }
    }
  });
  clone
    .querySelectorAll("script,dialog,.gallery-motion-controls,.scroll-message")
    .forEach((el) => el.remove());
  clone.inert = true;
  return clone;
}
