import { useRef, useState } from "react";
import { addServedMediaToProjectAssets } from "../studio/project-assets";
import { SendToDirector } from "../studio/SendToDirector";
import {
  scrollExamples as examples,
  type ScrollExample,
} from "./example-catalog";
/**
 * An example straight into the open project's assets, under Project, the
 * way a result's **Add to assets** files it (`Results.tsx`). The library
 * files are served by the studio, so the shared served-media path reads
 * and checks them; nothing joins the scroll.
 */
export const addExampleToAssets = (
  example: Pick<ScrollExample, "file">,
  add = addServedMediaToProjectAssets,
) => add(`/scrolls/${example.file}`, example.file, "production");

export function ScrollExamples({
  onImport,
  onStart,
}: {
  onImport: (file: File) => Promise<boolean | undefined>;
  onStart: (file: File, example: ScrollExample) => Promise<boolean | undefined>;
}) {
  const [selected, setSelected] = useState(examples[0]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function load(plan: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/scrolls/${selected.file}`);
      if (!response.ok) throw new Error("Could not load example.");
      const file = new File([await response.blob()], selected.file, {
        type: "image/png",
      });
      const success = await (plan ? onStart(file, selected) : onImport(file));
      if (success !== false) dialog.current?.close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="scroll-examples" aria-label="Design reference library">
      <div className="scroll-section-heading">
        <h3>From the design library</h3>
        <span>Examples, separate from your assets</span>
      </div>
      <div className="scroll-example-grid">
        {examples.map((e) => (
          <button
            key={e.file}
            onClick={() => {
              setSelected(e);
              setError("");
              dialog.current?.showModal();
            }}
          >
            <img loading="lazy" src={`/scrolls/${e.file}`} alt={e.name} />
            <span>{e.name}</span>
          </button>
        ))}
      </div>
      <dialog className="scroll-example-dialog" ref={dialog}>
        <div className="scroll-section-heading">
          <h3>{selected.name}</h3>
          <button onClick={() => dialog.current?.close()}>Close</button>
        </div>
        <img src={`/scrolls/${selected.file}`} alt={selected.name} />
        {selected.capture ? (
          <p>
            Captured in {selected.made}: eight 3D scenes with an animated
            character, not AI-generated. Its storyboard plan loads editable
            panels and gives each panel its own first frame as a reference, so
            Fill panels draws every panel from its own 3D blocking.
          </p>
        ) : (
          <p>
            AI-generated with {selected.made}, as the file&rsquo;s content
            credentials state. Add it as a whole-sheet reference, or use its
            storyboard plan to load editable shot titles, camera directions and
            actions. Panels stay in one image.
          </p>
        )}
        <div className="scroll-toolbar">
          {selected.plan && (
            <button
              disabled={busy}
              className="scroll-primary"
              onClick={() => void load(true)}
            >
              Use storyboard plan
            </button>
          )}
          <button disabled={busy} onClick={() => void load(false)}>
            {busy ? "Loading…" : "Add to my references"}
          </button>
          <SendToDirector
            label="Add to assets"
            disabled={busy}
            send={() => addExampleToAssets(selected)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
      </dialog>
    </section>
  );
}
