import { Suspense } from "react";
import { lazyReload } from "../lazy-reload";
const AsciiStudy = lazyReload(() => import("./AsciiStudy"));

export default function TasteExamples() {
  return (
    <section className="taste-examples" aria-label="Taste layer examples">
      <article>
        <video
          controls
          preload="none"
          poster="/media/template-gallery/signal-taste-reel.preview.jpg"
          aria-label="Signal motion preset showcase"
        >
          <source
            src="/media/template-gallery/signal-taste-reel.preview.mp4"
            type="video/mp4"
          />
        </video>
        <p className="taste-tag">01 / CONSTRUCTION</p>
        <h2>Make the making visible.</h2>
        <p>
          Wireframes, streamed annotations and a resolved interface. Built with
          Jakub Antalik’s Transitions.dev UI generation effect.
        </p>
        <a href="/motion/index.html">Three Genobi motion workflows ↗</a>
      </article>
      <article>
        <Suspense fallback={<p>Loading ASCII study…</p>}>
          <AsciiStudy />
        </Suspense>
        <p className="taste-tag">02 / ASCII</p>
        <h2>Geometry, written in light.</h2>
        <p>
          An original Genobi torus study using Three.js AsciiEffect. The same
          treatment is available for local GLB characters in Signal.
        </p>
        <a href="https://threejs.org/examples/#webgl_effects_ascii">
          Three.js authors & upstream example ↗
        </a>
      </article>
      <article className="taste-next">
        <p className="taste-tag">03 / NEXT MATERIALS</p>
        <h2>From pixels to pencil.</h2>
        <p>
          Paper’s shaders, Pixi’s CRT and glitch filters, GlyphCSS typography,
          and Krbn’s graphite-like drawing are recommended building blocks.
          Follow the examples below to explore the original creators’ work.
        </p>
        <a href="#libraries">Explore the libraries &amp; projects ↗</a>
      </article>
    </section>
  );
}
