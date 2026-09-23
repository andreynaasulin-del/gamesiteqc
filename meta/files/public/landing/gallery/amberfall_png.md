---
SECTION_ID: files.public.landing.gallery.amberfall_png
TYPE: file/image
---

# AMBERFALL — coin-run keyframe (renamed from lumen-hollow)

FILE: public/landing/gallery/amberfall.png
DESCRIPTION: Edit of lumen-hollow.png. Fixes the cause of early pickups: the old frame showed a coin already bursting in sparkles and 8 coins in a curve. Now only 3 large coins in a straight line on the path, well ahead of the player, no sparkle.
USAGE: Gallery carousel card (1:1) + Seedance first frame for amberfall.mp4
UTILITY: gpt_image
MODEL: gpt-image-2.5-sunburst
WIDTH: 1536
HEIGHT: 1536
QUALITY: high
OUTPUT_FORMAT: png
IMAGE-INPUT: public/landing/gallery/lumen-hollow.png
FILES: public/landing/gallery/lumen-hollow.png
PROMPT: |
  Image 1 is a video game screenshot. Make only these changes:
  1) Remove ALL the existing gold coins and any golden sparkle or burst effect near the player. Nothing is being picked up in this frame.
  2) Add exactly THREE large spinning gold coins, each about the size of the player's head, floating at the player's chest height directly above the center of the stone path, in one straight line going away from the camera: the first coin clearly ahead of the player (about three body lengths away), the second further along, the third near the start of the stone bridge. Thick metal coins with a simple embossed star, catching the sunset light, fully intact.
  3) The path between the player and the first coin is flat and clear: no roots, rocks or steps on it.
  Keep EVERYTHING else exactly the same: the explorer in the mustard-yellow hooded coat with backpack and brass lantern, her pose, the giant lantern tree, floating islands with waterfalls, big moon, sunset sky, river, bridge, flowers, camera angle, framing, colors, lighting and real-time game rendering look. No text, no numbers, no HUD, no logos.
