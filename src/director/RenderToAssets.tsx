import { useState } from "react";
import type { PageKey } from "../usePageKey";
import { copyAvailable } from "./project-copy";
import { saveRender } from "./save-render";

/**
 * The finished render into the project's assets, through the one path every
 * output takes (`saveRender` → `addToProjectAssets`). On the hosted site, with
 * no project copy, it is also saved to the visitor's private library so it
 * survives a reload. Importing other MP4s is the Assets rail's Project drop.
 */
export default function RenderToAssets({
  url,
  name,
  connection,
  disabled,
}: {
  url: string;
  name: string;
  connection: PageKey;
  disabled: boolean;
}) {
  const [key] = connection;
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  async function save() {
    setWorking(true);
    setMessage("");
    setFailure("");
    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("Render unavailable. Render the project again.");
      setMessage(
        await saveRender({
          blob: await response.blob(),
          name,
          copy: await copyAvailable(),
          key,
        }),
      );
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Asset operation failed.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <button disabled={disabled || working} onClick={() => void save()}>
        {working ? "Adding…" : "Add to project assets"}
      </button>
      {message && <p role="status">{message}</p>}
      {failure && <p role="alert">{failure}</p>}
    </>
  );
}
