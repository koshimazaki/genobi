/** Compatibility with jobs created before the three-section picker. */
export interface Preset {
  id: string;
  label: string;
  shortLabel: string;
  clause: string;
  wording: "documented" | "variant";
}

export const presets = [
  {
    id: "orbit_l",
    wording: "variant",
    label: "Orbit left",
    shortLabel: "Orbit left",
    clause: "slow orbit around the subject, moving left.",
  },
  {
    id: "orbit_r",
    wording: "variant",
    label: "Orbit right",
    shortLabel: "Orbit right",
    clause: "slow orbit around the subject, moving right.",
  },
  {
    id: "orbit_360",
    wording: "variant",
    label: "Full orbit",
    shortLabel: "Full orbit",
    clause: "slow orbit around the subject, completing a full circle.",
  },
  {
    id: "dolly_in",
    wording: "documented",
    label: "Dolly in",
    shortLabel: "Dolly in",
    clause: "dolly in toward the subject.",
  },
  {
    id: "dolly_out",
    wording: "variant",
    label: "Dolly out",
    shortLabel: "Dolly out",
    clause: "Dolly out from the subject.",
  },
  {
    id: "crane_up",
    wording: "documented",
    label: "Crane up",
    shortLabel: "Crane up",
    clause: "Crane boom shot rising above the subject.",
  },
  {
    id: "low",
    wording: "documented",
    label: "Low angle",
    shortLabel: "Low angle",
    clause: "low angle on the subject.",
  },
  {
    id: "top",
    wording: "documented",
    label: "Top-down",
    shortLabel: "Top-down",
    clause: "Bird's eye top-down view of the subject.",
  },
] as const;

export type PresetId = (typeof presets)[number]["id"];
