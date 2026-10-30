import { useEffect, useState } from "react";

/** Delete the old persisted credential without ever reading it back. */
export function clearLegacyKeyStorage(
  target: Pick<Window, "sessionStorage" | "localStorage">,
) {
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      target[name].removeItem("flux-studio-lite-key");
    } catch {
      /* Storage may be disabled. It is never required for credentials. */
    }
  }
}

/** Transient page memory only. Browser storage is never a credential source. */
export function usePageKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    clearLegacyKeyStorage(window);
    const clear = () => {
      setKey("");
      clearLegacyKeyStorage(window);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) clear();
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  return [key, setKey] as const;
}

export type PageKey = ReturnType<typeof usePageKey>;
