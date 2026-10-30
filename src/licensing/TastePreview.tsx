import { Suspense, useState } from "react";
import { lazyReload } from "../lazy-reload";
import { localDemos, tasteDemos } from "./taste-demos";
import { tasteMedia } from "./taste-media";
import { useDemoVisibility } from "./useDemoVisibility";
import "./taste-demos.css";

const LocalDemo = lazyReload(() => import("./TasteLocalDemo"));

/** Only fixed, curated demo URLs enter frames. Custom references never do. */
export default function TastePreview({
  id,
  name,
  url,
}: {
  id: string;
  name: string;
  url: string;
}) {
  const demo = tasteDemos[id];
  const local = localDemos[id];
  const media = tasteMedia[id];
  const [mediaFailed, setMediaFailed] = useState(false);
  const { ref, active, playing, toggle } = useDemoVisibility();
  if (!demo && !local && !media)
    return (
      <a
        className="taste-reference-link"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        Explore {name} ↗
      </a>
    );
  return (
    <div className="taste-preview" ref={ref}>
      <div className="taste-demo-stage">
        {active ? (
          local ? (
            <Suspense fallback={<p>Loading example…</p>}>
              <LocalDemo id={id} />
            </Suspense>
          ) : media ? (
            mediaFailed ? (
              <p className="taste-media-fallback">
                Preview unavailable. Open the original below.
              </p>
            ) : (
              <img
                src={media.src}
                alt={media.alt}
                referrerPolicy="no-referrer"
                onError={() => setMediaFailed(true)}
              />
            )
          ) : (
            <iframe
              title={`${name} interactive example`}
              src={demo.url}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              allow="autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'"
            />
          )
        ) : (
          <div className="taste-demo-rest">
            <span>{name}</span>
            <p>
              {playing ? "Example starts when in view." : "Example stopped."}
            </p>
            <button onClick={toggle}>
              {playing ? "Stop example" : "Play example"}
            </button>
          </div>
        )}
      </div>
      <div className="taste-demo-toolbar">
        <button
          onClick={toggle}
          aria-label={`${playing ? "Stop" : "Play"} ${name} example`}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <a href={demo?.url ?? url} target="_blank" rel="noreferrer">
          Open {media ? "source" : "example"} ↗
        </a>
      </div>
      <p>{local ?? demo?.hint ?? media?.alt}</p>
      <p className="taste-demo-credit">
        {media?.credit ??
          (id === "koda" || id === "andrew-zellinger"
            ? "Genobi workflow illustration · see the credited source"
            : local
              ? "Genobi sample · using the credited library"
              : demo.credit)}
      </p>
    </div>
  );
}
