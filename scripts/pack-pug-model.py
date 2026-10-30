"""Repack the pinned Three.js/Quaternius CC0 pug into one local GLB.

No mesh, rig or animation changes. Source hashes guard the exact r180 files.
"""
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

SOURCE = "https://raw.githubusercontent.com/mrdoob/three.js/r180/manual/examples/resources/models/animals/"
FILES = {
    "Pug.gltf": "a8e725fb055de210c7509e66af106c54b746e410f5bd0597886097e9b1a9ad5a",
    "Pug.bin": "8e313837ea010f73eeb48d198abf00112bfe6cd71ed79940ede55ebcc0cf3937",
}


def pack():
    sources = {}
    for name, expected in FILES.items():
        with urllib.request.urlopen(SOURCE + name, timeout=30) as response:
            data = response.read(1_000_001)
        if len(data) > 1_000_000 or hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Unexpected source bytes: {name}")
        sources[name] = data
    document = json.loads(sources["Pug.gltf"])
    if document.get("images") or document["buffers"] != [{"uri": "Pug.bin", "byteLength": len(sources["Pug.bin"])}]:
        raise ValueError("Expected the self-contained, untextured pug model.")
    del document["buffers"][0]["uri"]
    metadata = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode()
    metadata += b" " * (-len(metadata) % 4)
    binary = sources["Pug.bin"]
    binary += b"\0" * (-len(binary) % 4)
    result = struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(binary))
    result += struct.pack("<I4s", len(metadata), b"JSON") + metadata
    result += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    target = Path(__file__).resolve().parent.parent / "public/world-assets/Pug.glb"
    if target.exists() and target.read_bytes() != result:
        raise ValueError("Refusing to replace a different local Pug.glb.")
    target.write_bytes(result)
    print(f"Pug.glb: {len(result)} bytes; sha256 {hashlib.sha256(result).hexdigest()}")


if __name__ == "__main__":
    pack()
