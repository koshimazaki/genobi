import { useEffect, useState } from "react";
import { WorkspaceHeading } from "./WorkspaceHeading";
const KEY = "genobi-ninja-intro-v1";
export function NinjaHeading({ editing }: { editing: boolean }) {
  const [first, setFirst] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "seen";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (editing) setFirst(false);
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      /* This visit still works. */
    }
  }, [editing]);
  if (!first && !editing) return null;
  return (
    <section className="ninja-heading">
      <WorkspaceHeading
        title="Ninja"
        icon="ninja"
        purpose={
          editing
            ? "Custom setup / Choose and arrange your panels."
            : "Choose your panels / Make this workspace yours."
        }
      />
      {first && !editing && (
        <button onClick={() => setFirst(false)}>Got it</button>
      )}
    </section>
  );
}
