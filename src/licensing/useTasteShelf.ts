import { useEffect, useState } from "react";
import {
  defaultTasteShelf,
  type TasteShelf,
} from "../../shared/licensing/taste-shelf";
import type { TasteProfile } from "../../shared/memory/schema";
import { memoryRequest, readProfile } from "../memory/client";

export function useTasteShelf() {
  const [profile, setProfile] = useState<TasteProfile>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading your selection…");
  useEffect(() => {
    let active = true;
    readProfile()
      .then((p) => {
        if (active) {
          setProfile(p);
          setMessage("");
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "Browse the starter collection here. Open the local studio to save your selection and custom references.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(shelf: TasteShelf) {
    if (!profile || busy) return false;
    setBusy(true);
    try {
      const next = await memoryRequest<TasteProfile>("taste/shelf", {
        revision: profile.revision,
        shelf,
      });
      setProfile(next);
      setMessage("Saved for your agents.");
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      // Refresh after a conflict; never overwrite another tab's selection.
      try {
        setProfile(await readProfile());
      } catch {
        /* Keep the last confirmed selection. */
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    shelf: profile?.shelf ?? defaultTasteShelf(),
    disabled: !profile || busy,
    message,
    save,
  };
}
