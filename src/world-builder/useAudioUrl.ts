import { useEffect, useState } from "react";

/** The session owns each decoded track URL until replacement or unmount. */
export function useAudioUrl() {
  const [url, setUrl] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return [url, setUrl] as const;
}
