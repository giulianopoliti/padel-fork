"""Create the compact FV player panel montage.

Usage: python scripts/prepare-fv-panel-hero.py <WhatsApp videos folder>
Requires imageio-ffmpeg. Original files are preserved.
"""

from pathlib import Path
import subprocess
import sys
import tempfile

import imageio_ffmpeg

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / "public/tenants/padel-fv/panel"
destination.mkdir(parents=True, exist_ok=True)
names = [
    "WhatsApp Video 2026-10-12 at 1.55.35 PM.mp4",
    "WhatsApp Video 2026-10-12 at 2.49.01 PM.mp4",
    "WhatsApp Video 2026-10-12 at 2.49.02 PM.mp4",
]


def run(arguments: list[str]) -> None:
    result = subprocess.run([ffmpeg, "-y", *arguments], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)


with tempfile.TemporaryDirectory(prefix="fv-panel-") as temporary:
    clips = []
    for index, name in enumerate(names):
        clip = Path(temporary) / f"{index}.mp4"
        run(["-display_rotation", "0", "-i", str(source / name), "-t", "4",
             "-vf", "transpose=clock,scale=360:640,setsar=1,fps=24",
             "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
             "-map_metadata", "-1", str(clip)])
        clips.append(clip)

    inputs = []
    for clip in clips + [clips[0]]:
        inputs.extend(["-i", str(clip)])
    filters = [f"[{i}:v]format=yuv444p,setpts=PTS-STARTPTS,fps=24,settb=AVTB[v{i}]" for i in range(4)]
    previous = "v0"
    for index in range(1, 4):
        filters.append(f"[{previous}][v{index}]xfade=transition=fade:duration=0.5:offset={index * 3.5},fps=24,settb=AVTB[x{index}]")
        previous = f"x{index}"
    filters.append(f"[{previous}]trim=start=0.5:duration=10.5,setpts=PTS-STARTPTS,format=yuv420p[out]")
    video = destination / "fv-jugadores.mp4"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-an",
         "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-maxrate", "700k",
         "-bufsize", "1400k", "-r", "24", "-video_track_timescale", "12288",
         "-movflags", "+faststart", str(video)])
    run(["-i", str(video), "-frames:v", "1", "-quality", "80", str(video.with_suffix(".webp"))])
    print(f"{video.name}: {video.stat().st_size / 1024:.0f} KB, 10.5 seconds, no audio")
    desktop = destination / "fv-jugadores-desktop.mp4"
    run(["-i", str(video), "-filter_complex",
         "[0:v]split=2[bg][fg];[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,gblur=sigma=28[back];[fg]scale=-2:720,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*min(1,min(X/36,(W-1-X)/36))'[front];[back][front]overlay=x=main_w-overlay_w-96:y=0[out]",
         "-map", "[out]", "-an", "-c:v", "libx264", "-crf", "27", "-preset", "medium",
         "-maxrate", "800k", "-bufsize", "1600k",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(desktop)])
    run(["-i", str(desktop), "-frames:v", "1", "-quality", "80", str(desktop.with_suffix(".webp"))])
    print(f"{desktop.name}: {desktop.stat().st_size / 1024:.0f} KB")
