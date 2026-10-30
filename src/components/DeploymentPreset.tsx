import { useEffect, useRef, useState } from "react";
import type { WorkflowCatalogue } from "../../shared/comfy/workflows";
import {
  readWorkflows,
  selectWorkflow,
  type SettingView,
} from "../run-settings";
import { settingSaver, useSettingSaving } from "../settings-store";

/** Same sequenced settings lane as Recreate; Generate waits for confirmation. */
export default function DeploymentPreset() {
  const [view, setView] = useState<SettingView<WorkflowCatalogue>>({
    value: null,
    confirmed: true,
    saving: false,
    message: "",
  });
  const saver = useRef<ReturnType<typeof settingSaver<"workflow">>>(null);
  saver.current ??= settingSaver("workflow", (next) =>
    setView((old) => ({ ...old, ...next })),
  );
  const saving = useSettingSaving("workflow");
  useEffect(() => {
    const control = saver.current!;
    control.attach();
    const controller = new AbortController();
    void control.read(readWorkflows(controller.signal).catch(() => null));
    return () => {
      controller.abort();
      control.dispose();
    };
  }, []);
  const entry = view.value?.entries.find(
    (e) => e.entry === "ltx-deploy-layout-to-video",
  );
  return (
    <label>
      Layout preset
      <select
        value={entry?.selected ?? ""}
        disabled={saving || !view.confirmed || !entry}
        onChange={(e) => {
          if (!view.value || !entry) return;
          const id = e.target.value;
          void saver.current!.save(
            {
              ...view.value,
              entries: view.value.entries.map((old) =>
                old.entry === entry.entry ? { ...old, selected: id } : old,
              ),
            },
            () => selectWorkflow(entry.entry, id),
          );
        }}
      >
        {!entry && <option value="">Checking workflow…</option>}
        <option value="world-builder-l2r-a2v">Party</option>
        <option value="world-builder-l2r-a2v-studio">Studio</option>
      </select>
      {view.message && <span role="status">{view.message}</span>}
    </label>
  );
}
