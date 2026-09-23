#!/bin/sh
# 1) Near-lossless smaller inputs for Topaz (upload limit -> 413 on 50MB+ sources).
# 2) Abyss site cut: HQ abyss-v3 from 13s to the end (PO decision).
set -e
cd "$(dirname "$0")/.."
H=public/landing/hq
mkdir -p "$H/src"
for f in emberveil-v2 verdant-v2; do
  ffmpeg -y -loglevel error -i "public/landing/explore/$f.mp4" -an -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -movflags +faststart "$H/src/$f.mp4"
  printf '%s %s\n' "$f" "$(du -h "$H/src/$f.mp4" | cut -f1)"
done
# Frame-accurate cut (re-encode, not stream copy) so it starts exactly at 13.0s.
ffmpeg -y -loglevel error -ss 13 -i "$H/abyss-v3.mp4" -an -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "$H/abyss-v3-13.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$H/abyss-v3-13.mp4"
echo done
