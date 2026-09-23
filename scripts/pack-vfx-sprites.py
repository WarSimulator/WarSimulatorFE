"""Pack Blender RGBA frames into WebP sprite sheets."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


def pack(source: Path, destination: Path, frames_destination: Path, columns: int = 8) -> dict[str, int | str]:
    frames = [Image.open(path).convert("RGBA") for path in sorted(source.glob("frame-*.png"))]
    if not frames:
        raise RuntimeError(f"No frames found in {source}")
    width, height = frames[0].size
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * width, rows * height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % columns) * width, (index // columns) * height))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "WEBP", lossless=True, method=6)
    if frames_destination.exists():
        shutil.rmtree(frames_destination)
    frames_destination.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(frames_destination / f"frame-{index:02d}.png", "PNG", optimize=True)
    return {
        "src": f"/vfx/sprites/{destination.name}",
        "frameBase": f"/vfx/frames/{frames_destination.name}",
        "frames": len(frames), "columns": columns, "rows": rows,
        "frameWidth": width, "frameHeight": height,
    }


parser = argparse.ArgumentParser()
parser.add_argument("--frames", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
arguments = parser.parse_args()

sprites = arguments.output / "sprites"
webp_frames = arguments.output / "frames"
manifest = {
    "explosion": {**pack(arguments.frames / "explosion", sprites / "explosion.webp", webp_frames / "explosion"), "durationSeconds": 1.4},
    "smoke": {**pack(arguments.frames / "smoke", sprites / "smoke.webp", webp_frames / "smoke"), "durationSeconds": 2.4},
    "models": {"debris": "/vfx/models/debris-01.glb", "crater": "/vfx/models/crater-01.glb"},
}
(arguments.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Packed VFX sprites in {sprites}")
