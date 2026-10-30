"""Canny-style edges and depth batches for World Builder takes, in torch only."""
import torch
import torch.nn.functional as F

GAUSS = torch.tensor([1, 4, 6, 4, 1], dtype=torch.float32) / 16
SOBEL = torch.tensor([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=torch.float32)


def _filter(x, kernel):
    return F.conv2d(F.pad(x, [kernel.shape[-1] // 2] * 2 + [kernel.shape[-2] // 2] * 2, mode="replicate"), kernel)


def canny(frames, low=0.1, high=0.25, chunk=16):
    """IMAGE [B,H,W,3] in 0-1 → white-on-black edge IMAGE of the same shape.
    Gaussian 5×5 blur, Sobel gradient, non-maximum suppression along four
    directions, then double threshold (relative to each frame's strongest edge)
    with one-pass 8-neighbour hysteresis.
    """
    if frames.ndim != 4 or frames.shape[-1] != 3:
        raise ValueError("Expected an IMAGE batch [B,H,W,3]")
    out = []
    g = GAUSS.to(frames.device)
    sobel_x = SOBEL.to(frames.device)[None, None]
    sobel_y = sobel_x.transpose(-1, -2)
    for start in range(0, len(frames), chunk):
        rgb = frames[start:start + chunk].float()
        grey = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114)[:, None]
        grey = _filter(_filter(grey, g.view(1, 1, 1, 5)), g.view(1, 1, 5, 1))
        gx, gy = _filter(grey, sobel_x), _filter(grey, sobel_y)
        magnitude = torch.hypot(gx, gy)
        angle = torch.rad2deg(torch.atan2(gy, gx)) % 180
        padded = F.pad(magnitude, [1, 1, 1, 1])
        h, w = magnitude.shape[-2:]
        shift = lambda dy, dx: padded[..., 1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
        keep = torch.zeros_like(magnitude, dtype=torch.bool)
        for lo, hi, (dy, dx) in ((0, 22.5, (0, 1)), (157.5, 180.1, (0, 1)), (22.5, 67.5, (1, 1)),
                                 (67.5, 112.5, (1, 0)), (112.5, 157.5, (1, -1))):
            band = (angle >= lo) & (angle < hi)
            keep |= band & (magnitude >= shift(dy, dx)) & (magnitude >= shift(-dy, -dx))
        thin = magnitude * keep
        peak = thin.amax(dim=(-2, -1), keepdim=True).clamp_min(1e-6)
        strong = thin >= high * peak
        weak = (thin >= low * peak) & ~strong
        grown = F.max_pool2d(strong.float(), 3, stride=1, padding=1) > 0
        edges = (strong | (weak & grown)).float()
        out.append(edges[:, 0, :, :, None].expand(-1, -1, -1, 3).to(frames.dtype))
    return torch.cat(out) if out else frames.new_zeros(frames.shape)


def depth_batch(frames, depth=None):
    """Greyscale depth replicated to 3 channels, matching `frames`; black when absent."""
    if depth is None:
        return torch.zeros_like(frames)
    if depth.shape[:3] != frames.shape[:3]:
        raise ValueError("Depth take does not match the colour take's frame count or size")
    return depth.mean(dim=-1, keepdim=True).expand(-1, -1, -1, 3).contiguous()
