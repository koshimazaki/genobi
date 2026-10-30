import { useStore } from "zustand";
import { studioStore, type StudioState } from "./store";
export function useStudio<T>(selector: (state: StudioState) => T) {
  return useStore(studioStore, selector);
}
