import type { Layer, Project } from "../../shared/director/types";
import { reorderLane } from "../../shared/director/tracks";
import { duplicateLayer } from "../../shared/director/duplicate";
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
        changeList(duplicateLayer(project, layer.id, id).layers);
        select(id);
      }}
      remove={() =>
        layer && changeList(project.layers.filter((l) => l.id !== layer.id))
      }
      reorder={(delta) =>
        layer &&
        changeList(reorderLane(project.layers, layer.id, delta > 0 ? 1 : -1))
      }
    />
  );
}
