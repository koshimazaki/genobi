import type { Layer, Project } from "../../shared/director/types";
import { laneId, reorderLane, type Lane } from "../../shared/director/tracks";
import {
  arrange,
  VIEWS,
  VIEW_NAMES,
  viewKey,
  type View,
} from "./channel-layout";
import type { RowAction } from "./ChannelHeader";
import { useTimelineView } from "./useTimelineView";

const HEIGHTS: Record<string, number> = {
  storyboard: 92,
  audio: 44,
  camera: 40,
  action: 40,
  markers: 30,
  rhythm: 30,
};
const DEFAULT_HEIGHT = 30;

interface Row {
  view?: View;
  lane?: Lane;
  height: number;
  setHeight: (n: number) => void;
  actions: RowAction[];
}

/**
 * The timeline's rows in presentation order, with each row's menu. Moving a
 * row up or down changes only this viewer's presentation; Raise and Lower in
 * stack are the existing compositing reorder and are named as such. Removing
 * a view hides it; removing a layer row deletes its clips through the same
 * undoable edit as the inspector, and is refused while any clip is locked.
 */
export function useTimelineRows({
  project,
  rows,
  story,
  expanded,
  disabled,
  select,
  changeList,
  report,
}: {
  project: Project;
  /** Lanes top of stack first. */
  rows: Lane[];
  story?: Lane;
  expanded: boolean;
  disabled: boolean;
  select: (id: string) => void;
  changeList: (layers: Layer[]) => void;
  report: (e: unknown) => void;
}) {
  const t = useTimelineView(project.id);
  const defaults = [
    viewKey("markers"),
    viewKey("rhythm"),
    ...rows.flatMap((lane) =>
      lane.id === story?.id
        ? [lane.id, viewKey("camera"), viewKey("action")]
        : [lane.id],
    ),
  ];
  const full = arrange(defaults, t.order);
  const shown = full.filter((k) => {
    const v = viewOf(k);
    return !v || !t.views[v].removed;
  });
  function shift(key: string, by: -1 | 1) {
    const at = shown.indexOf(key),
      other = shown[at + by];
    if (other === undefined) return;
    const next = [...full];
    const a = next.indexOf(key),
      b = next.indexOf(other);
    [next[a], next[b]] = [next[b], next[a]];
    t.setOrder(next);
  }
  function setLane(
    id: string,
    patch: Partial<Pick<Layer, "muted" | "locked">>,
  ) {
    const members = project.layers.filter((l) => laneId(l) === id);
    if (!members.length) return;
    changeList(
      project.layers.map((l) => (laneId(l) === id ? { ...l, ...patch } : l)),
    );
  }
  const height = (key: string, kind: string) => {
    const base = t.heights[key] ?? HEIGHTS[kind] ?? DEFAULT_HEIGHT;
    return expanded && !t.heights[key] ? Math.max(56, base) : base;
  };
  function row(key: string): Row {
    const at = shown.indexOf(key);
    const presentation: RowAction[] = [
      {
        label: "Move up",
        run: () => shift(key, -1),
        disabled: at <= 0,
        title: "Presentation only: the compositing stack is unchanged",
      },
      {
        label: "Move down",
        run: () => shift(key, 1),
        disabled: at >= shown.length - 1,
        title: "Presentation only: the compositing stack is unchanged",
      },
    ];
    const v = viewOf(key);
    if (v) {
      const s = t.views[v];
      return {
        view: v,
        height: height(key, v),
        setHeight: (n) => t.height(key, n),
        actions: [
          ...presentation,
          {
            label: `${s.hidden ? "Show" : "Hide"} view`,
            run: () => t.view(v, { hidden: !s.hidden }),
          },
          {
            label: `${s.locked ? "Unlock" : "Lock"} view`,
            run: () => t.view(v, { locked: !s.locked }),
          },
          {
            label: "Remove view",
            run: () => t.view(v, { removed: true }),
            title:
              "Hides the view; directions, prompts and media are kept. Add layer restores it.",
          },
        ],
      };
    }
    const lane = rows.find((r) => r.id === key)!;
    const stackAt = rows.indexOf(lane);
    const locked = lane.layers.some((l) => l.locked);
    const head = lane.layers[0];
    return {
      lane,
      height: height(key, lane.id === story?.id ? "storyboard" : head.kind),
      setHeight: (n) => t.height(key, n),
      actions: [
        ...presentation,
        {
          label: "Raise in stack",
          disabled: disabled || stackAt <= 0,
          title:
            "Composites this layer above the one over it (the inspector's Move up)",
          run: () => changeList(reorderLane(project.layers, head.id, 1)),
        },
        {
          label: "Lower in stack",
          disabled: disabled || stackAt >= rows.length - 1,
          title: "Composites this layer below the one under it",
          run: () => changeList(reorderLane(project.layers, head.id, -1)),
        },
        {
          label: "Remove layer",
          disabled: disabled || locked,
          title: locked
            ? "Unlock this layer first"
            : "Removes its clips; Undo restores them",
          run: () => {
            try {
              changeList(project.layers.filter((l) => laneId(l) !== lane.id));
              select("");
            } catch (e) {
              report(e);
            }
          },
        },
      ],
    };
  }
  return {
    order: shown,
    row,
    views: t.views,
    view: t.view,
    setLane,
    removedViews: VIEWS.filter((v) => t.views[v].removed),
    restore: (v: View) => t.view(v, { removed: false }),
    viewName: (v: View) => VIEW_NAMES[v],
  };
}

function viewOf(key: string): View | undefined {
  return VIEWS.find((v) => viewKey(v) === key);
}
