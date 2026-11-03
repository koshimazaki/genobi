---
name: ui-teardown
description: Present a product interface as an exploded view - rebuild the real UI as a working HTML or React replica, split it into a few transparent layers lifted apart along one axis in CSS 3D, number each product part and give every part a sheet (role, spec, note, source at a pinned commit). The UI variant of the 3D teardown pattern, for case studies, teasers and walkthroughs. Nothing is generated or paid for.
license: MIT
compatibility: Any browser page (plain HTML/CSS/JS or React). No Genobi server needed; captures and teaser use go through the studio as usual.
metadata:
  version: "0.1.0"
  tags: "agents, design, studio, 3d"
  docs: "docs/credits/libraries/teardown/README.md, docs/world-builder-sound.md"
---

# UI teardown: take the interface apart

The 3D [teardown](https://github.com/elvarofficial/teardown) skill opens a
machine; this one opens an interface. The pattern comes from the owner's
FLUX Studio Lite case study, where the composer was taken apart into 5 layers
and 11 parts. One page shows two views of the same working UI:

- **Assembled** is the real interface, and it works. Its paid action rehearses
  its states (Sending, Queued, Generating…) and sends nothing.
- **Exploded** lifts the layers apart, tilts the assembly and numbers every
  part. Picking a part opens its sheet. Operating the UI puts it back together
  first.

## 1. Rebuild, do not screenshot

Build the replica from the product's own tokens and components, so it reads
the same as the live screen and every control still works. A screenshot cannot
be taken apart or operated. Keep it to one screen and one task: a composer, a
panel, a toolbar. Never call a provider from the replica; rehearse instead.

## 2. Choose layers, then parts

- **3 to 6 layers, outermost to innermost**: the housing (panel and borders),
  the content (prompt, media), the details (clauses, labels), the controls
  (fields, toggles), the action (estimate and the one paid button).
- **Parts are product ideas, not DOM nodes.** Number what a person would name:
  `GN-01 Housing`, `GN-05 Model`, `GN-11 Generate`. Two DOM nodes can share one
  part; a part can span a layer. Around 8 to 12 is readable.
- Each part gets a **sheet**: what it does (role), its hard facts (spec: ranges,
  states, sizes), why it is that way (note), and a link to its source at a
  pinned commit. Write only what the source shows.

## 3. The CSS 3D assembly

```css
.stage {
  perspective: 2600px;
  overflow: hidden;
}
.assembly {
  transform-style: preserve-3d;
  transition: transform 0.9s cubic-bezier(0.2, 0.75, 0.2, 1);
}
.plane {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  pointer-events: none;
  transition: transform 0.9s cubic-bezier(0.2, 0.75, 0.2, 1);
}
.exploded .assembly {
  transform: translateY(34%) rotateX(54deg) rotateZ(-26deg) scale(0.8);
}
.exploded .plane {
  transform: translateZ(calc(var(--z) * 66px));
}
[data-part] {
  pointer-events: auto;
  cursor: pointer;
}
.part-no {
  opacity: 0;
  transition: opacity 0.4s;
}
.exploded .part-no {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .assembly,
  .plane {
    transition: none;
  }
}
```

Each layer is `<div class="plane" style="--z:2">`; each part carries
`data-part="GN-04"`. Show a faint dashed outline per plane only when exploded,
so the layers read as sheets of glass.

## 4. React shape

```tsx
type Part = {
  id: string;
  name: string;
  layer: number;
  role: string;
  spec: string;
  note: string;
  src: string;
};
const [view, setView] = useState<"assembled" | "exploded">("assembled");
const [picked, setPicked] = useState<string | null>(null);
// Operating the replica reassembles it first.
const operate = () => view === "exploded" && setView("assembled");
```

Render the layers from the `PARTS` data, the view toggle as two buttons with
`aria-pressed`, the parts list as buttons, and the sheet in an
`aria-live="polite"` region. Part numbers on the stage are `aria-hidden`; the
list is the accessible copy.

## 5. Motion and sound (optional)

- **Stagger like the 3D explode.** `shared/scene/explode.ts` starts the
  outermost part first; do the same with a `transition-delay` per layer
  (outermost 0 ms, then about 60 ms each) so nothing appears to cross.
- **Audio-reactive.** For a teaser, drive the lift (`66px` above) from the
  track's envelope instead of a toggle: analyse once (`genobi_audio_analysis`),
  read the value on the frame grid, and set it per frame, so a capture is the
  same every time. In World Builder the same idea is the `explode` audio route
  (`docs/world-builder-sound.md`).

## 6. Check before calling it done

- Look at stills of both views at desktop and phone widths: no part clipped by
  the stage, labels never on top of the part they name, the tilt still
  readable.
- Click every part in the list; each sheet's source link opens the right lines.
- Operate the assembled UI once end to end; confirm nothing was sent.
- Credit the product and any libraries used next to the output.
