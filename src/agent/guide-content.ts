/**
 * What the Genobi guide says (`GenobiGuide.tsx`): static, curated and local.
 * Nothing here is fetched, inferred or generated. Pointers are per studio
 * mode; each action only moves the person (open Camera, open Assets, open
 * Set up). Keep every line true of the shipped studio (#57: swap, not
 * regeneration; new media is made in Camera and shows up in Assets).
 */
export type GuideAction = "camera" | "assets" | "setup";

export interface GuidePointer {
  text: string;
  action?: GuideAction;
}

const SWAP: GuidePointer[] = [
  {
    text: "Swap a clip: drag a video from Assets onto a template slot. Undo puts the original back.",
    action: "assets",
  },
  {
    text: "Drop a track on the soundtrack slot to swap the music. The cut keeps its timing.",
  },
  {
    text: "Need new footage? Create it in Camera. It appears in Assets → Generated; nothing is swapped in by itself.",
    action: "camera",
  },
];

const POINTERS: Record<string, GuidePointer[]> = {
  gallery: [
    {
      text: "Pick a template to open it in Director. Its cut, effects and soundtrack are ready to swap.",
    },
    {
      text: "Create in Camera when you need new media.",
      action: "camera",
    },
  ],
  camera: [
    {
      text: "Write a prompt, check the price beside Generate, then press it yourself. Paid runs never start on their own.",
    },
    {
      text: "Finished results show in the gallery and in Assets → Generated for Director and Editor.",
      action: "assets",
    },
  ],
  director: SWAP,
  editor: [
    ...SWAP.slice(0, 2),
    {
      text: "Import an MP4 by dropping it on the Assets rail's Project tab.",
      action: "assets",
    },
  ],
  world: [
    {
      text: "Capture a take: it lands in your project's Assets as an MP4.",
      action: "assets",
    },
  ],
  dual: [
    {
      text: "Export a frame to send it to your project's Assets.",
      action: "assets",
    },
  ],
  scrolls: [
    {
      text: "Send a sheet or panel to Director to use it in a project.",
      action: "assets",
    },
  ],
};

/** The pointers for a studio mode; a sensible default for any other. */
export function guidePointers(preset: string | undefined): GuidePointer[] {
  return (preset && POINTERS[preset]) || SWAP;
}

/** Setup help, in the order a new local studio needs it. */
export const SETUP_STEPS: readonly string[] = [
  "Connect a key: Set up's Connect step takes your provider key. Keys stay transient; they are never saved or logged.",
  "Start local ComfyUI: choose to generate on this computer in Set up, then run your own ComfyUI so open-weights models use your GPU.",
  "Download models: a local run needs its workflow's models in your ComfyUI models folder. Getting started in the docs lists them.",
];

export const ACTION_LABEL: Record<GuideAction, string> = {
  camera: "Open Camera",
  assets: "Open Assets",
  setup: "Set up Genobi",
};
