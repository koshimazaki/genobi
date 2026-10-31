"""Pure capture receipt bounds shared by the Comfy tensor entry points."""
import json

MAX_FRAMES = 721


def recipe_data(text):
    if not isinstance(text, str) or len(text.encode()) > 64000:
        raise ValueError("Recipe must be JSON under 64 KB")
    data = json.loads(text)
    if not isinstance(data, dict) or data.get("version") != 1 or data.get("fps") != 24:
        raise ValueError("Expected World Builder recipe v1 at 24 fps")
    for key in ("width", "height"):
        n = data.get(key)
        if type(n) is not int or n < 256 or n > 1920 or n % 64:
            raise ValueError("Invalid capture dimensions")
    n = data.get("frames")
    if type(n) is not int or n < 9 or n > MAX_FRAMES or (n - 1) % 8:
        raise ValueError("Invalid capture frame count")
    for key in ("loop", "screen"):
        if key in data and type(data[key]) is not bool:
            raise ValueError(f"Recipe {key} must be true or false")
    if data["width"] * data["height"] * n * 12 > 2 * 1024 * 1024 * 1024:
        raise ValueError("Decoded take exceeds 2 GiB; reduce size or frames")
    return data
