#!/bin/sh
# Light webp posters/thumbs for the landing showreel + gallery videos.
# The keyframe PNGs are ~3 MB each; the page must never load them.
set -e
cd "$(dirname "$0")/.."
E=public/landing/explore
G=public/landing/gallery
mkdir -p "$E/posters" "$G/posters"
for f in railrun-v2 shroud-v2 emberveil-v2 abyss rally verdant-v2 tidewalker-v2; do
  ffmpeg -y -loglevel error -ss 0.2 -i "$E/$f.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 72 "$E/posters/$f.webp"
  ffmpeg -y -loglevel error -ss 2 -i "$E/$f.mp4" -frames:v 1 -vf scale=320:-2 -q:v 70 "$E/posters/$f-thumb.webp"
done
for f in ring-planet-v3 orbit-dock kelp-diver apex-pass sky-isles amberfall; do
  ffmpeg -y -loglevel error -ss 0.2 -i "$G/$f.mp4" -frames:v 1 -vf scale=720:-2 -q:v 72 "$G/posters/$f.webp"
done
ls -la "$E/posters" "$G/posters"
for f in "$E"/railrun-v2.mp4 "$E"/shroud-v2.mp4 "$E"/emberveil-v2.mp4 "$E"/abyss.mp4 "$E"/rally.mp4 "$E"/verdant-v2.mp4 "$E"/tidewalker-v2.mp4 "$G"/ring-planet-v3.mp4 "$G"/orbit-dock.mp4 "$G"/kelp-diver.mp4 "$G"/apex-pass.mp4 "$G"/sky-isles.mp4 "$G"/amberfall.mp4; do
  printf '%s ' "$f"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height:format=duration,size -of csv=p=0 "$f" | tr '\n' ' '
  echo
done
