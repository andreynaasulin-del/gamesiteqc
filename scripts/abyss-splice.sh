#!/bin/sh
# abyss-v3 = new action body (Seedance, ends on abyss-splice.png)
#          + ORIGINAL abyss.mp4 tail from 26.5s (jaws lunge, lights die, black).
# The tail is never regenerated — it is cut from the original frame-exact.
set -e
cd "$(dirname "$0")/.."
E=public/landing/explore
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of csv=p=0 "$E/abyss-v3-body.mp4"
# Drop the body's last frame (it duplicates the splice frame the tail opens with).
ffmpeg -y -loglevel error -i "$E/abyss-v3-body.mp4" -i "$E/abyss.mp4" -filter_complex \
  "[0:v]scale=1280:720:flags=lanczos,fps=24,setsar=1,trim=end_frame=99999,setpts=PTS-STARTPTS[b0]; \
   [b0]reverse,trim=start_frame=1,reverse,setpts=PTS-STARTPTS[b]; \
   [1:v]trim=start=26.5,setpts=PTS-STARTPTS,fps=24,setsar=1[t]; \
   [b][t]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart "$E/abyss-v3.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$E/abyss-v3.mp4"
# Contact sheet around the joint (body end -> tail start) + full overview.
mkdir -p .temp/abyss
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$E/abyss-v3-body.mp4")
S=$(echo "$D - 1.2" | bc)
ffmpeg -y -loglevel error -ss "$S" -i "$E/abyss-v3.mp4" -vf "fps=5,scale=480:-2,tile=4x3" -frames:v 1 .temp/abyss/joint-sheet.png
ffmpeg -y -loglevel error -i "$E/abyss-v3.mp4" -vf "fps=0.5,scale=480:-2,tile=4x4" -frames:v 1 .temp/abyss/v3-overview.png
echo done
