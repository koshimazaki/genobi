import type { Layer, Project } from "../../shared/director/types";
import { reorderLane } from "../../shared/director/tracks";
import Inspector from "./Inspector";

export default function LayerInspector({
  project,
  layer,
  disabled,
  close,
  edit,
  changeList,
  select,
  replace,
  command,
  report,
}: {
  project: Project;
  layer?: Layer;
  disabled: boolean;
  close: () => void;
  edit: (patch: Partial<Layer>) => void;
  changeList: (layers: Layer[]) => void;
  select: (id: string) => void;
  replace: () => void;
  command: (command: unknown) => string;
  report: (error: unknown) => void;
}) {
  return (
    <Inspector
      project={project}
      layer={layer}
      disabled={disabled}
      close={close}
      edit={edit}
      replace={replace}
      command={command}
      duplicate={() => {
        if (!layer) return;
        const id = `layer-${crypto.randomUUID().slice(0, 8)}`;
        const error = command({
          op: "duplicate-clip",
          layerId: layer.id,
          newLayerId: id,
        });
        if (error) report(new Error(error));
        else select(id);
      }}
      remove={() => {
        if (!layer) return;
        const error = command({ op: "remove-clip", layerId: layer.id });
        if (error) report(new Error(error));
      }}
      reorder={(delta) =>
        layer &&
        changeList(reorderLane(project.layers, layer.id, delta > 0 ? 1 : -1))
      }
    />
  );
}
