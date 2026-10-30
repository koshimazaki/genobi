import { studioStore } from "../studio/store";
import type { MediaSlot } from "./remix-slots";

/**
 * The "Add your media" slots. A dropped or chosen file replaces the slot's
 * layers through the `replace` command; "Choose from project" opens the asset
 * drawer aimed at them.
 */
export default function MediaSlots({
  slots,
  disabled,
  replace,
}: {
  slots: MediaSlot[];
  disabled: boolean;
  replace: (slot: MediaSlot, file: File) => void;
}) {
  return (
    <div className="dir-template-slots">
      {slots.map((slot) => {
        const off = disabled || slot.locked;
        return (
          <label
            className="dir-media-slot"
            key={slot.id}
            data-slot={slot.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file && !off) replace(slot, file);
            }}
          >
            <strong>{slot.label}</strong>
            <span>{slot.hint}</span>
            <input
              disabled={off}
              type="file"
              aria-label={`Replace ${slot.label}`}
              accept={slot.accept}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) replace(slot, file);
              }}
            />
            <button
              type="button"
              disabled={off}
              onClick={(e) => {
                e.preventDefault();
                studioStore.getState().actions.workspace({
                  drawerOpen: true,
                  targetLayers: [...slot.layerIds],
                  assetRole: "production",
                });
              }}
            >
              Choose from project
            </button>
            <small>Choose a file or drop it here</small>
          </label>
        );
      })}
    </div>
  );
}
