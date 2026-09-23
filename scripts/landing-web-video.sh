#!/bin/sh
# Web copies of the landing clips -> public/landing/web/<id>.mp4 (+ posters).
# Source priority: Topaz HQ (public/landing/hq/<id>.mp4) -> original 720p.
# Originals/HQ are never shipped (see .vercelignore / .gitignore).
# Usage: sh scripts/landing-web-video.sh [id ...]   (no args = all)
set -e
cd "$(dirname "$0")/.."
W=public/landing/web
EP=public/landing/explore/posters
GP=public/landing/gallery/posters
mkdir -p "$W" "$EP" "$GP"
src() { # id dir
  case "$1" in
    abyss-v3) echo public/landing/hq/abyss-v3-13.mp4; return ;; # PO: start at 13s
  esac
  if [ -f "public/landing/hq/$1.mp4" ]; then echo "public/landing/hq/$1.mp4"; else echo "public/landing/$2/$1.mp4"; fi
}
enc() { # src out scale crf maxrate
  ffmpeg -y -loglevel error -i "$1" -an -vf "$3:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -tune film -crf "$4" -maxrate "$5" -bufsize "$5" \
    -profile:v high -movflags +faststart "$2"
  printf '%-44s <- %-44s %s\n' "$2" "$1" "$(du -h "$2" | cut -f1)"
}
STAGE="railrun-v2 shroud-v2 emberveil-v2 abyss-v3 rally verdant-v2 tidewalker-v2"
CARDS="ring-planet-v3 orbit-dock kelp-diver apex-pass sky-isles amberfall"
ARGS="$*"
want() { [ -z "$ARGS" ] && return 0; for a in $ARGS; do [ "$a" = "$1" ] && return 0; done; return 1; }
for f in $STAGE; do
  want "$f" || continue
  s=$(src "$f" explore)
  enc "$s" "$W/$f.mp4" "scale=1920:-2" 21 7M
  ffmpeg -y -loglevel error -ss 0.2 -i "$W/$f.mp4" -frames:v 1 -vf scale=1920:-2 -q:v 80 "$EP/$f.webp"
  ffmpeg -y -loglevel error -ss 2 -i "$W/$f.mp4" -frames:v 1 -vf scale=320:-2 -q:v 72 "$EP/$f-thumb.webp"
done
for f in $CARDS; do
  want "$f" || continue
  s=$(src "$f" gallery)
  enc "$s" "$W/$f.mp4" "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)'" 22 4M
  ffmpeg -y -loglevel error -ss 0.2 -i "$W/$f.mp4" -frames:v 1 -vf "scale='if(gt(iw,ih),960,-2)':'if(gt(iw,ih),-2,960)'" -q:v 78 "$GP/$f.webp"
done
du -sh "$W"
