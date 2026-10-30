import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EditorAssets } from "../dual-editor/useEditorAssets";
import type { PanelId, Preset } from "./presets";
export type HostId = PanelId | "header" | "galleryFilters" | "toolAssets";
export type ShellState = {
  preset: Preset;
  navigation: ReactNode;
  assetsOpen: boolean;
  setAssetsOpen: (open: boolean) => void;
  library: EditorAssets;
  select: (preset: Preset) => void;
  visible: readonly PanelId[];
  hosts: Record<HostId, HTMLDivElement>;
};
export const ShellContext = createContext<ShellState | null>(null);
export const useShell = () => useContext(ShellContext);
/** Stable portal destinations let the real tool keep its hooks and canvas. */
export function StudioPanel({
  id,
  children,
}: {
  id: HostId;
  children: ReactNode;
}) {
  const shell = useShell();
  return shell ? createPortal(children, shell.hosts[id]) : <>{children}</>;
}
