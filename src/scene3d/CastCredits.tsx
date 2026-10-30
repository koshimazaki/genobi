import { CHARACTER_MODELS } from "../../shared/scene/character-catalog";
import type { SceneSpec } from "./scenes";

/** Keep attribution with footage, including exports made without an LTX kit. */
export function CastCredits({ scene }: { scene: SceneSpec }) {
  const ids = [...new Set(scene.characters?.map((c) => c.asset) ?? [])];
  if (!ids.length) return null;
  const credits = ids.map((id) => CHARACTER_MODELS[id].credit).join("\n\n");
  function download() {
    const url = URL.createObjectURL(
      new Blob([`# ${scene.label}: cast credits\n\n${credits}\n`], {
        type: "text/markdown",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scene.id}-cast-credits.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="s3d-fold s3d-cast-credits">
      <summary>Cast credits</summary>
      <div className="s3d-fold-body">
        {ids.map((id) => (
          <p className="s3d-status" key={id}>
            {CHARACTER_MODELS[id].credit}
          </p>
        ))}
        <button className="s3d-secondary" type="button" onClick={download}>
          Download cast credits
        </button>
      </div>
    </details>
  );
}
