import { useEffect, useRef, useState } from "react";
import {
  defaultMorphControl,
  type SceneMorphControl,
} from "./scene-morph-control";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";

/** Coalesces a drag's newest point while a previous scene configure is settling. */
export function useMorphRouting(s: BuilderSession, e: WorldEditor) {
  const incoming =
    s.recipe.motion!.morphControl ?? defaultMorphControl(s.recipe.motion!);
  const [control, setControl] = useState(incoming);
  const draft = useRef(control),
    pending = useRef<SceneMorphControl | null>(null);
  const writing = useRef(false),
    alive = useRef(true);
  const latest = useRef({ s, e });
  latest.current = { s, e };
  const signature = JSON.stringify(incoming);
  useEffect(() => {
    if (!writing.current) {
      const value = JSON.parse(signature) as SceneMorphControl;
      draft.current = value;
      setControl(value);
    }
  }, [signature]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current = null;
    };
  }, []);
  const update = (edit: (value: SceneMorphControl) => SceneMorphControl) => {
    const next = edit(draft.current);
    if (next === draft.current) return;
    draft.current = next;
    setControl(next);
    pending.current = next;
    if (writing.current) return;
    writing.current = true;
    void (async () => {
      try {
        while (pending.current && alive.current) {
          const value = pending.current;
          pending.current = null;
          const { s: session, e: editor } = latest.current;
          const motion =
            session.api.current?.getRecipe().motion ?? session.recipe.motion;
          if (!motion) break;
          if (editor.mode !== "shot") editor.chooseMode("shot", false);
          const ok = await session.tune({
            motion: {
              ...motion,
              morphControl: value,
              ...(value.enabled && motion.stateAudio
                ? { stateAudio: { ...motion.stateAudio, enabled: false } }
                : {}),
            },
          });
          if (!ok && alive.current) {
            pending.current = null;
            const current =
              session.api.current?.getRecipe().motion ?? session.recipe.motion!;
            const restored =
              current.morphControl ?? defaultMorphControl(current);
            draft.current = restored;
            setControl(restored);
          }
        }
      } finally {
        writing.current = false;
      }
    })();
  };
  return { control, update };
}
