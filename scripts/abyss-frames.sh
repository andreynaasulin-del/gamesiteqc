#!/bin/sh
# Contact sheet of the last 12s of abyss.mp4 (1 frame / s) to pick the
# splice point that keeps the ending untouched.
set -e
cd "$(dirname "$0")/.."
mkdir -p .temp/abyss
ffprobe -v error -show_entries format=duration -of csv=p=0 public/landing/explore/abyss.mp4
ffmpeg -y -loglevel error -ss 18 -i public/landing/explore/abyss.mp4 -vf "fps=1,scale=480:-2,tile=4x3" -frames:v 1 .temp/abyss/tail-sheet.png
# Fine sheet 26-28.4s (0.2s steps) to see exactly where the lunge starts.
ffmpeg -y -loglevel error -ss 26 -i public/landing/explore/abyss.mp4 -vf "fps=5,scale=480:-2,tile=4x3" -frames:v 1 .temp/abyss/fine-sheet.png
# Splice frame = first frame of the kept tail (becomes IMAGE-INPUT-2).
ffmpeg -y -loglevel error -ss 26.5 -i public/landing/explore/abyss.mp4 -frames:v 1 public/landing/explore/abyss-splice.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 public/landing/explore/abyss.mp4
echo done
