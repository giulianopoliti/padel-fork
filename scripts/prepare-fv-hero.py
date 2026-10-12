"""Build silent, seamless FV hero videos. Requires Python + imageio-ffmpeg.

Usage: python scripts/prepare-fv-hero.py <folder containing the WhatsApp clips>
The originals are never modified.
"""

from pathlib import Path
import subprocess
import sys
import tempfile

import imageio_ffmpeg


ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / "public/tenants/padel-fv/hero"
names = [
    "WhatsApp Video 2026-10-12 at 1.55.25 PM.mp4",
    "WhatsApp Video 2026-10-12 at 2.49.02 PM (1).mp4",
    "WhatsApp Video 2026-10-12 at 1.55.33 PM.mp4",
    "WhatsApp Video 2026-10-12 at 1.55.33 PM (1).mp4",
]
durations = [160 / 30, 208 / 30, 142 / 30, 63 / 30]
fade = 0.6


def run(arguments: list[str]) -> None:
    result = subprocess.run([ffmpeg, "-y", *arguments], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)


with tempfile.TemporaryDirectory(prefix="fv-hero-") as temporary:
    clips = []
    for index, name in enumerate(names):
        clip = Path(temporary) / f"{index}.mp4"
        # Remove rotation metadata after autorotation to prevent a second rotation.
        run(["-display_rotation", "0", "-i", str(source / name),
             "-vf", "transpose=clock,scale=576:1024,setsar=1,fps=30",
             "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
             "-map_metadata", "-1", str(clip)])
        clips.append(clip)

    inputs = []
    for clip in clips + [clips[0]]:
        inputs.extend(["-i", str(clip)])
    filters = [f"[{i}:v]format=yuv444p,setpts=PTS-STARTPTS,fps=30,settb=AVTB[v{i}]" for i in range(5)]
    offset = 0.0
    previous = "v0"
    for index in range(1, 5):
        offset += durations[index - 1] - fade
        filters.append(f"[{previous}][v{index}]xfade=transition=fade:duration={fade}:offset={offset:.6f},fps=30,settb=AVTB[x{index}]")
        previous = f"x{index}"
    length = sum(durations) - 4 * fade
    # Crossfade back into clip one; start/end at the same point for a seamless loop.
    filters.append(f"[{previous}]trim=start={fade}:duration={length:.6f},setpts=PTS-STARTPTS,format=yuv420p[final]")
    portrait = destination / "fv-circuito-vertical.mp4"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[final]",
         "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "22",
         "-movflags", "+faststart", str(portrait)])

    landscape = destination / "fv-circuito-desktop.mp4"
    run(["-i", str(portrait), "-filter_complex",
         "[0:v]split=2[bg][fg];[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,gblur=sigma=28[back];[fg]scale=-2:720,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*min(1,min(X/36,(W-1-X)/36))'[front];[back][front]overlay=x=main_w-overlay_w-96:y=0,setsar=1[out]",
         "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(landscape)])

    for asset in [portrait, landscape]:
        run(["-i", str(asset), "-frames:v", "1", "-quality", "85", str(asset.with_suffix(".webp"))])
        print(f"{asset.name}: {asset.stat().st_size / 1024 / 1024:.2f} MB, {length:.1f} seconds, no audio")
