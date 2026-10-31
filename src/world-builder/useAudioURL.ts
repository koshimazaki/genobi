import { useEffect, useState } from "react";

/** The session owns each decoded track URL until replacement or unmount. */
export function useAudioURL() {
  const [url, setURL] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return [url, setURL] as const;
}
