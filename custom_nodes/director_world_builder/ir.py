"""Room impulse response from a World Builder recipe's geometry. numpy only.

Early part: image sources in the shoebox the Acoustics node measures, to order 3.
Late part: seeded Gaussian noise under the Sabine RT60 decay, low-passed harder
as it decays so the highs die first. Time zero is the direct sound's arrival;
the direct sound itself is left to the dry path.
"""
import math

import numpy as np

from .acoustics import TABLE, estimate

SPEED = 343.0
AIR = 0.0012  # broadband air loss in nepers per metre (about 0.01 dB/m)
MARGIN = 0.1
OUTDOOR_FLOOR = TABLE["colour_classes"]["mid"]
OUTDOOR_RT60 = 0.4
MATERIALS = ["none", *TABLE["absorption"]]


def parse_point(text, label):
    """"x,y,z" in metres, or None when empty."""
    if text is None or not str(text).strip():
        return None
    parts = str(text).replace(" ", "").split(",")
    if len(parts) != 3:
        raise ValueError(f"{label} must be 'x,y,z' in metres")
    try:
        point = [float(v) for v in parts]
    except ValueError as error:
        raise ValueError(f"{label} must be 'x,y,z' in metres") from error
    if not all(math.isfinite(v) and abs(v) < 10000 for v in point):
        raise ValueError(f"{label} is out of range")
    return point


def room_model(recipe, size_scale=1.0, decay_scale=1.0, material="none"):
    """Shoebox, absorption and RT60 for a recipe dict, after the scale and override."""
    result = estimate(recipe)
    override = TABLE["absorption"].get(material) if material and material != "none" else None
    if result["size"] is None:
        floor = OUTDOOR_FLOOR if override is None else override
        return {"outdoor": True, "preset": result["preset"], "floor": floor,
                "rt60": OUTDOOR_RT60 * decay_scale, "lo": None, "dims": None, "built": None}
    lo, hi = (np.array(v, dtype=float) for v in result["bounds"])
    dims = np.maximum(hi - lo, 0.1)
    alpha = dict(result["alpha"])
    w, h, length = dims
    floor_area, wall_area = w * length, 2 * (w + length) * h
    shell = lambda a: (a["floor"] + a["ceiling"]) * floor_area + a["walls"] * wall_area
    furniture = max(result["sabins"] - shell(alpha), 0.0)
    if override is not None:
        alpha = {"floor": override, "ceiling": override, "walls": override}
    # Sabine scales linearly with length: V grows by s³, absorbing area by s².
    rt60 = 0.161 * w * h * length / (shell(alpha) + furniture) * size_scale * decay_scale
    centre = (lo + hi) / 2
    scaled_lo = np.array([centre[0] - w * size_scale / 2, lo[1], centre[2] - length * size_scale / 2])
    return {"outdoor": False, "preset": result["preset"], "alpha": alpha, "rt60": float(rt60),
            "lo": scaled_lo, "dims": dims * size_scale, "built": (lo, dims), "scale": size_scale}


def positions(model, source_text="", listener_text=""):
    """Source and listener in room-local metres (origin at the scaled room's low corner).

    Inputs are recipe world coordinates (x across, y up, z along the room), clamped
    inside the built room and then carried into the scaled one. Defaults: listener
    at the room centre 1.6 m above the floor, source 2 m in front of it along +z.
    """
    source, listener = parse_point(source_text, "source_position"), parse_point(listener_text, "listener_position")
    if model["outdoor"]:
        listener = listener or [0.0, 1.6, 0.0]
        source = source or [listener[0], listener[1], listener[2] + 2.0]
        listener[1], source[1] = max(listener[1], 0.05), max(source[1], 0.05)
        return np.array(source), np.array(listener)
    lo, dims = model["built"]
    centre = lo + dims / 2
    listener = listener or [centre[0], lo[1] + 1.6, centre[2]]
    source = source or [listener[0], listener[1], listener[2] + 2.0]
    margin = np.minimum(MARGIN, dims / 4)
    clamp = lambda p: np.clip(np.array(p, dtype=float), lo + margin, lo + dims - margin)
    relative = lambda p: (clamp(p) - lo) / dims * model["dims"]
    return relative(source), relative(listener)


def image_sources(model, source, listener, max_order=3):
    """(delay in s after the direct sound, amplitude relative to it) per reflection."""
    direct = max(float(np.linalg.norm(source - listener)), 0.1)
    if model["outdoor"]:
        image = source * np.array([1, -1, 1])
        d = float(np.linalg.norm(image - listener))
        gain = math.sqrt(1 - model["floor"]) * direct / d * math.exp(-AIR * (d - direct))
        return [((d - direct) / SPEED, gain)], direct
    dims, a = model["dims"], model["alpha"]
    walls = ((a["walls"], a["walls"]), (a["floor"], a["ceiling"]), (a["walls"], a["walls"]))
    axes = []
    for i in range(3):
        options = []
        for n in range(-max_order, max_order + 1):
            for q in (0, 1):
                low, high = abs(n - q), abs(n)
                if low + high <= max_order:
                    coord = 2 * n * dims[i] + (source[i] if q == 0 else -source[i])
                    options.append((coord, low + high, math.sqrt(1 - walls[i][0]) ** low * math.sqrt(1 - walls[i][1]) ** high))
        axes.append(options)
    out = []
    for x, ox, gx in axes[0]:
        for y, oy, gy in axes[1]:
            for z, oz, gz in axes[2]:
                order = ox + oy + oz
                if order == 0 or order > max_order:
                    continue
                d = math.dist((x, y, z), listener)
                out.append(((d - direct) / SPEED, gx * gy * gz * direct / d * math.exp(-AIR * (d - direct))))
    return out, direct


def late_tail(length, rate, rt60, damping, rng, frame=1024):
    """Decaying noise whose one-pole low-pass cutoff falls with time.

    The one-pole magnitude response |H| = 1/sqrt(1 + (f/fc)²) is applied per
    frame in the STFT domain (Hann, 50% overlap), which keeps it vectorised.
    """
    hop = frame // 2
    frames = max(1, math.ceil(length / hop) + 1)
    noise = rng.standard_normal((frames - 1) * hop + frame)
    window = np.hanning(frame + 1)[:-1]
    times = np.arange(frames) * hop / rate
    start_fc = min(16000.0, 0.45 * rate)
    fc = np.maximum(250.0, start_fc * 10 ** (-2.0 * damping * times / max(rt60, 0.05)))
    freqs = np.fft.rfftfreq(frame, 1 / rate)
    shaped = np.zeros_like(noise)
    index = np.arange(frames)[:, None] * hop + np.arange(frame)[None]
    spectra = np.fft.rfft(noise[index] * window, axis=1)
    if damping > 0:
        spectra /= np.sqrt(1 + (freqs[None] / fc[:, None]) ** 2)
    blocks = np.fft.irfft(spectra, n=frame, axis=1)
    np.add.at(shaped, index, blocks)  # Hann at 50% overlap sums to one
    t = np.arange(length) / rate
    return shaped[:length] * np.exp(-6.9078 * t / max(rt60, 0.05))


def impulse_response(model, source, listener, rate, *, damping_high=0.3, pre_delay_ms=0.0,
                     early_late_balance=0.5, max_ir_seconds=6.0, seed=0):
    """Mono float32 IR with unit energy, and a dict describing it."""
    reflections, direct = image_sources(model, source, listener)
    rt60 = max(model["rt60"], 0.05)
    last = max((t for t, _ in reflections), default=0.0)
    pre = round(pre_delay_ms / 1000 * rate)
    body = min(max_ir_seconds - pre / rate, last + 1.1 * rt60)
    length = max(int(body * rate), 16)
    early = np.zeros(length)
    for t, gain in reflections:
        n = round(t * rate)
        if n < length:
            early[n] += gain
    tail = late_tail(length, rate, rt60, damping_high, np.random.default_rng(seed))
    # Ramp the tail in over 20 ms ending at the last early reflection.
    fade = max(int(0.02 * rate), 1)
    end = min(round(last * rate), length)
    ramp = np.clip((np.arange(length) - (end - fade)) / fade, 0, 1)
    tail *= 0.5 - 0.5 * np.cos(np.pi * ramp)
    e_early, e_tail = float(np.sum(early ** 2)), float(np.sum(tail ** 2))
    balance = min(max(early_late_balance, 0.0), 1.0)
    early *= math.sqrt((1 - balance) / e_early) if e_early > 0 else 0.0
    tail *= math.sqrt(balance / e_tail) if e_tail > 0 else 0.0
    ir = early + tail
    out_fade = min(int(0.05 * rate), length // 4)
    if out_fade:
        ir[-out_fade:] *= np.linspace(1, 0, out_fade)
    energy = float(np.sum(ir ** 2))
    if energy > 0:
        ir /= math.sqrt(energy)
    ir = np.concatenate([np.zeros(pre), ir]).astype(np.float32)
    return ir, {"rt60": rt60, "seconds": len(ir) / rate, "reflections": len(reflections),
                "direct_m": direct, "early_end_s": last}
