import type { RefObject } from "react";
import type { Bundle } from "./bundle";
import { addMedia } from "./import-media";

export default function MediaReplacementInput({
  input,
  target,
  bundle,
  frame,
  imageFrames,
  busy,
  commit,
  report,
}: {
  input: RefObject<HTMLInputElement | null>;
  target: RefObject<string | undefined>;
  bundle?: Bundle;
  frame: number;
  imageFrames: number;
  busy: (value: boolean) => void;
  commit: (bundle: Bundle) => void;
  report: (error: unknown) => void;
}) {
  return (
    <input
      hidden
      ref={input}
      type="file"
      accept="image/png,image/jpeg,image/webp,video/*,audio/*"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!bundle || !file || !target.current) return;
        busy(true);
        try {
          commit(
            await addMedia(bundle, [file], frame, target.current, imageFrames),
          );
        } catch (error) {
          report(error);
        } finally {
          target.current = undefined;
          busy(false);
        }
      }}
    />
  );
}
