export type Vec3 = [number, number, number];

export interface CameraHotkey {
  key: string;
  label: string;
  shift?: boolean;
}

export type CameraHotkeyId =
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "0"
  | "Shift+5"
  | "Shift+6"
  | "Shift+7"
  | "Shift+8"
  | "Shift+9"
  | "Shift+0";

export type CameraMoveKey =
  | "top"
  | "side"
  | "front"
  | "orbit60"
  | "orbit90"
  | "orbit120"
  | "orbit180"
  | "orbit360"
  | "face"
  | "highWide"
  | "wideOrbit"
  | "pushIn"
  | "pullOut"
  | "lowTrack"
  | "sideAction"
  | "shoulder"
  | "crane"
  | "skydive"
  | "reset";

export type CameraMove =
  | {
      key: CameraMoveKey;
      label: string;
      hotkey?: CameraHotkey;
      kind: "static";
      position: Vec3;
      target: Vec3;
      trackCharacter?: false;
      releaseFollowCam?: boolean;
    }
  | {
      key: CameraMoveKey;
      label: string;
      hotkey?: CameraHotkey;
      kind: "follow";
      offset: Vec3;
      lookOffset: Vec3;
      trackCharacter: true;
      releaseFollowCam?: false;
    }
  | {
      key: CameraMoveKey;
      label: string;
      hotkey?: CameraHotkey;
      kind: "orbit";
      degrees: number;
      radius: number;
      height: number;
      lookOffset: Vec3;
      trackCharacter: true;
      releaseFollowCam?: false;
    };

export const DEFAULT_CAMERA_MOVE_DURATION_SEC = 4;

export const CAMERA_HOTKEY_CHOICES: CameraHotkeyId[] = [
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "Shift+5",
  "Shift+6",
  "Shift+7",
  "Shift+8",
  "Shift+9",
  "Shift+0",
];

export const DEFAULT_CAMERA_HOTKEYS: Record<CameraHotkeyId, CameraMoveKey> = {
  "5": "orbit60",
  "6": "orbit90",
  "7": "orbit120",
  "8": "orbit180",
  "9": "face",
  "0": "wideOrbit",
  "Shift+5": "shoulder",
  "Shift+6": "crane",
  "Shift+7": "pushIn",
  "Shift+8": "pullOut",
  "Shift+9": "lowTrack",
  "Shift+0": "sideAction",
};

export type CameraHotkeyBindings = Partial<
  Record<CameraHotkeyId, CameraMoveKey>
>;

export function isAssignableCameraHotkey(
  hotkey: string,
): hotkey is CameraHotkeyId {
  return CAMERA_HOTKEY_CHOICES.includes(hotkey as CameraHotkeyId);
}

export function formatCameraHotkeyLabel(hotkey: string): string {
  return hotkey.replace("Shift+", "S");
}

export function cameraHotkeyIdFromEvent(event: KeyboardEvent): string {
  const digit = event.code.startsWith("Digit")
    ? event.code.replace("Digit", "")
    : event.code.startsWith("Numpad")
      ? event.code.replace("Numpad", "")
      : "";
  const key = digit || event.key;
  return event.shiftKey ? `Shift+${key}` : key;
}

export const CAMERA_MOVES: CameraMove[] = [
  {
    key: "top",
    label: "Top",
    kind: "static",
    position: [0, 25, 0.1],
    target: [0, 0, 0],
  },
  {
    key: "side",
    label: "Side",
    kind: "static",
    position: [25, 10, 0],
    target: [0, 0, 0],
  },
  {
    key: "front",
    label: "Front",
    kind: "static",
    position: [0, 5, 25],
    target: [0, 0, 0],
  },
  {
    key: "orbit60",
    label: "60",
    kind: "orbit",
    degrees: 60,
    radius: 10,
    height: 3.5,
    lookOffset: [0, 1.15, 0],
    trackCharacter: true,
  },
  {
    key: "orbit90",
    label: "90",
    kind: "orbit",
    degrees: 90,
    radius: 11,
    height: 3.8,
    lookOffset: [0, 1.2, 0],
    trackCharacter: true,
  },
  {
    key: "orbit120",
    label: "120",
    hotkey: { key: "7", label: "7" },
    kind: "orbit",
    degrees: 120,
    radius: 12,
    height: 4,
    lookOffset: [0, 1.2, 0],
    trackCharacter: true,
  },
  {
    key: "orbit180",
    label: "180",
    hotkey: { key: "8", label: "8" },
    kind: "orbit",
    degrees: 180,
    radius: 13,
    height: 4.5,
    lookOffset: [0, 1.25, 0],
    trackCharacter: true,
  },
  {
    key: "orbit360",
    label: "360",
    kind: "orbit",
    degrees: 360,
    radius: 13,
    height: 4.5,
    lookOffset: [0, 1.25, 0],
    trackCharacter: true,
  },
  {
    key: "face",
    label: "Face",
    hotkey: { key: "9", label: "9" },
    kind: "follow",
    offset: [0, 2.3, 7],
    lookOffset: [0, 1.25, 0],
    trackCharacter: true,
  },
  {
    // Wide lens, close and above: the whole figure, large in frame, looking
    // down (azimuth comes from the take; 2.7 m at 25 degrees, aimed at 1.0 m).
    key: "highWide",
    label: "High wide",
    kind: "follow",
    offset: [0, 1.1411, 2.447],
    lookOffset: [0, 1, 0],
    trackCharacter: true,
  },
  {
    key: "wideOrbit",
    label: "Wide",
    hotkey: { key: "0", label: "0" },
    kind: "orbit",
    degrees: -180,
    radius: 23,
    height: 8,
    lookOffset: [0, 1.5, 0],
    trackCharacter: true,
  },
  {
    key: "pushIn",
    label: "Push",
    hotkey: { key: "7", label: "S7", shift: true },
    kind: "follow",
    offset: [0, 2.0, 4.2],
    lookOffset: [0, 1.25, 0],
    trackCharacter: true,
  },
  {
    key: "pullOut",
    label: "Pull",
    hotkey: { key: "8", label: "S8", shift: true },
    kind: "follow",
    offset: [0, 4.8, 18],
    lookOffset: [0, 1.45, 0],
    trackCharacter: true,
  },
  {
    key: "lowTrack",
    label: "Low",
    hotkey: { key: "9", label: "S9", shift: true },
    kind: "follow",
    offset: [0, 0.45, -3.6],
    lookOffset: [0, 0.75, 0],
    trackCharacter: true,
  },
  {
    key: "sideAction",
    label: "Side FX",
    hotkey: { key: "0", label: "S0", shift: true },
    kind: "follow",
    offset: [9, 2.4, 0],
    lookOffset: [0, 1.25, 0],
    trackCharacter: true,
  },
  {
    key: "shoulder",
    label: "Shoulder",
    kind: "follow",
    offset: [2.2, 2.2, -4.8],
    lookOffset: [0, 1.45, 0],
    trackCharacter: true,
  },
  {
    key: "crane",
    label: "Crane",
    kind: "follow",
    offset: [0, 11, -13],
    lookOffset: [0, 1.6, 0],
    trackCharacter: true,
  },
  {
    // Just above and behind a face-down faller, aimed down past his head at
    // what is coming up (2 m behind and 3 m above the feet, 57 degrees down).
    key: "skydive",
    label: "Skydive",
    kind: "follow",
    offset: [0, 7, -4.5],
    lookOffset: [0, -4, 2.5],
    trackCharacter: true,
  },
  {
    key: "reset",
    label: "Reset",
    kind: "static",
    position: [0, 5, 10],
    target: [0, 0, 0],
    releaseFollowCam: true,
  },
];

export const CAMERA_MOVE_BY_KEY = Object.fromEntries(
  CAMERA_MOVES.map((move) => [move.key, move]),
) as Record<CameraMoveKey, CameraMove>;

export const CAMERA_MOVE_BY_HOTKEY = Object.fromEntries(
  Object.entries(DEFAULT_CAMERA_HOTKEYS).map(([hotkey, moveKey]) => [
    hotkey,
    CAMERA_MOVE_BY_KEY[moveKey],
  ]),
) as Partial<Record<string, CameraMove>>;
