"""Storyboard grid: up to eight first frames tiled into one IMAGE for FLUX Klein."""
import torch
import torch.nn.functional as F

LAYOUTS = {"2x2": (2, 2), "1x4": (1, 4), "2x4": (2, 4)}
MAX_PANELS = 8


def _cell(image, w, h):
    """First frame of a batch, letterboxed onto a black w×h cell with its aspect kept."""
    frame = image[0].float().clamp(0, 1).permute(2, 0, 1)[None, :3]
    ih, iw = frame.shape[-2:]
    scale = min(w / iw, h / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    frame = F.interpolate(frame, size=(nh, nw), mode="bilinear", align_corners=False, antialias=True)
    cell = torch.zeros((3, h, w))
    top, left = (h - nh) // 2, (w - nw) // 2
    cell[:, top:top + nh, left:left + nw] = frame[0].clamp(0, 1)
    return cell


def grid(images, cell_width, cell_height, layout):
    if layout not in LAYOUTS:
        raise ValueError("Layout must be 2x2, 1x4 or 2x4")
    if cell_width % 64 or cell_height % 64 or not 64 <= cell_width <= 2048 or not 64 <= cell_height <= 2048:
        raise ValueError("Cell width and height must be multiples of 64 between 64 and 2048")
    rows, cols = LAYOUTS[layout]
    extra = [i + 1 for i, image in enumerate(images) if image is not None and i >= rows * cols]
    if extra:
        raise ValueError(f"{layout} holds {rows * cols} panels; image_{extra[0]} is connected. Use 2x4 for eight")
    canvas = torch.zeros((3, rows * cell_height, cols * cell_width))
    panels = []
    for i, image in enumerate(images[:rows * cols]):
        row, col = divmod(i, cols)
        where = f"row {row + 1}, column {col + 1}"
        if image is None:
            panels.append(f"{i + 1}: empty ({where})")
            continue
        if image.ndim != 4 or image.shape[-1] < 3 or len(image) < 1:
            raise ValueError(f"Panel {i + 1} needs an IMAGE batch [B,H,W,3]")
        canvas[:, row * cell_height:(row + 1) * cell_height, col * cell_width:(col + 1) * cell_width] = \
            _cell(image.detach().cpu(), cell_width, cell_height)
        panels.append(f"{i + 1}: image_{i + 1} first frame ({where})")
    summary = f"{layout} grid, {cols * cell_width}×{rows * cell_height}, left to right, top to bottom. " + "; ".join(panels)
    return canvas.permute(1, 2, 0)[None].contiguous(), summary


class DirectorStoryboardGrid:
    """Tile the first frame of up to eight IMAGE batches into one storyboard sheet."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"cell_width": ("INT", {"default": 512, "min": 64, "max": 2048, "step": 64}),
                             "cell_height": ("INT", {"default": 512, "min": 64, "max": 2048, "step": 64}),
                             "layout": (list(LAYOUTS), {"default": "2x2"})},
                "optional": {f"image_{i}": ("IMAGE",) for i in range(1, MAX_PANELS + 1)}}

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("grid", "panels")
    FUNCTION = "tile"
    CATEGORY = "Director/World Builder"

    def tile(self, cell_width, cell_height, layout, *images, **named):
        """Positional images fill image_1 onwards; named image_N inputs (Comfy's call) override."""
        slots = list(images[:MAX_PANELS]) + [None] * (MAX_PANELS - min(len(images), MAX_PANELS))
        for i in range(MAX_PANELS):
            if f"image_{i + 1}" in named:
                slots[i] = named[f"image_{i + 1}"]
        unknown = set(named) - {f"image_{i}" for i in range(1, MAX_PANELS + 1)}
        if unknown:
            raise ValueError(f"Unknown input {sorted(unknown)[0]}")
        return grid(slots, cell_width, cell_height, layout)
