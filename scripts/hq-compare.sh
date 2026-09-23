#!/bin/sh
# Same-moment crop, original 720p vs Topaz HQ, to judge the upscale.
# Usage: sh scripts/hq-compare.sh <src.mp4> <hq.mp4> <time>
set -e
cd "$(dirname "$0")/.."
mkdir -p .temp/hq
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate:format=duration,size -of csv=p=0 "$2"
# Centre crop at 1:1 of the HQ size; source upscaled with plain bicubic for a fair look.
ffmpeg -y -loglevel error -ss "$3" -i "$1" -frames:v 1 -vf "scale=2560:1440:flags=bicubic,crop=960:600:800:300" .temp/hq/a.png
ffmpeg -y -loglevel error -ss "$3" -i "$2" -frames:v 1 -vf "scale=2560:1440,crop=960:600:800:300" .temp/hq/b.png
echo done
