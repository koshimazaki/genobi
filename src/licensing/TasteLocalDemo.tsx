import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import type p5 from "p5";
import TasteWorkflowDemo from "./TasteWorkflowDemo";

function Ripple() {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(
    () => () => {
      animation.current?.revert();
    },
    [],
  );
  function ripple(from: number) {
    if (!ref.current) return;
    animation.current?.revert();
    animation.current = animate(ref.current.querySelectorAll("button"), {
      scale: [
        { to: 0.3, duration: 180 },
        { to: 1, duration: 900 },
      ],
      rotate: [
        { to: 90, duration: 180 },
        { to: 0, duration: 900 },
      ],
      borderRadius: ["50%", "20%", "50%"],
      delay: stagger(45, { grid: [8, 5], from }),
      ease: "outElastic(1, .5)",
    });
  }
  return (
    <div
      ref={ref}
      className="taste-ripple"
      aria-label="Interactive Anime.js ripple"
    >
      {Array.from({ length: 40 }, (_, i) => (
        <button
          key={i}
          aria-label={`Start ripple from dot ${i + 1}`}
          onClick={() => ripple(i)}
        />
      ))}
    </div>
  );
}

function Ribbons() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let disposed = false;
    let sketch: p5 | undefined;
    let observer: ResizeObserver | undefined;
    void import("p5")
      .then(({ default: P5 }) => {
        if (disposed) return;
        sketch = new P5((p) => {
          let ink = 0;
          p.setup = () => {
            p.createCanvas(node.clientWidth, 320);
            p.pixelDensity(1);
            p.frameRate(30);
            p.noFill();
            observer = new ResizeObserver(() =>
              p.resizeCanvas(node.clientWidth, 320),
            );
            observer.observe(node);
          };
          p.draw = () => {
            p.background("#101316");
            const t = p.frameCount * 0.014;
            const bend = p.constrain(p.mouseX / Math.max(1, p.width), 0, 1);
            for (let row = 0; row < 26; row++) {
              p.stroke(ink % 2 ? "#bc9aff" : "#d5ff70");
              p.strokeWeight(1);
              p.beginShape();
              for (let x = -10; x < p.width + 12; x += 6) {
                const wave = Math.sin(x * 0.012 + t + row * 0.14);
                p.vertex(
                  x,
                  75 +
                    row * 7 +
                    wave * (18 + bend * 60) * Math.sin((x / p.width) * Math.PI),
                );
              }
              p.endShape();
            }
          };
          p.mousePressed = () => {
            if (
              p.mouseX >= 0 &&
              p.mouseX <= p.width &&
              p.mouseY >= 0 &&
              p.mouseY <= p.height
            )
              ink++;
          };
        }, node);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      sketch?.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      className="taste-ribbons"
      role="img"
      aria-label="p5.js flowing ribbons"
    >
      {error && <p>Drawing unavailable. Open the original example below.</p>}
    </div>
  );
}

function TypeSample({ mono }: { mono: boolean }) {
  const [text, setText] = useState("Make something\nunexpected.");
  return (
    <label
      className={`taste-type-sample ${mono ? "taste-type-mono" : "taste-type-geist"}`}
    >
      <span>YOUR WORDS / {mono ? "IBM PLEX MONO" : "GEIST"}</span>
      <textarea
        aria-label={`Try ${mono ? "IBM Plex Mono" : "Geist"}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={180}
        spellCheck={false}
      />
      <span>Aa Bb Cc · 0123456789 · &amp; @ / →</span>
    </label>
  );
}

export default function TasteLocalDemo({ id }: { id: string }) {
  if (id === "koda" || id === "andrew-zellinger")
    return <TasteWorkflowDemo id={id} />;
  if (id === "animejs") return <Ripple />;
  if (id === "p5") return <Ribbons />;
  if (id === "ibm-plex-mono" || id === "geist")
    return <TypeSample mono={id === "ibm-plex-mono"} />;
  return (
    <video
      controls
      playsInline
      muted
      loop
      preload="none"
      poster="/media/template-gallery/signal-taste-reel.preview.jpg"
      aria-label="Genobi construction study using Transitions.dev"
    >
      <source
        src="/media/template-gallery/signal-taste-reel.preview.mp4"
        type="video/mp4"
      />
    </video>
  );
}
