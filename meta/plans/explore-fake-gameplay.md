---
SECTION_ID: plans.explore-fake-gameplay
TYPE: note
---

# Explore section → 6 fake gameplay reels (for paid ads)

PO: replace "Explore Quadcode games" completely. Totally different games, totally different
styles, graphically insane. Assets via GPT-Image first (PO approves/edits), then Seedance 2.5.

## Concepts (one art style each — no two may look alike)
| id | Game | Genre | Style |
|---|---|---|---|
| neon-drift | NEON DRIFT | arcade racer | synthwave cyberpunk, rain, neon reflections, 3rd-person chase cam |
| inkblade | INKBLADE | action slasher | Japanese sumi-e ink wash, black/white + blood-red only |
| sugar-rush | SUGAR RUSH | 3D platformer | claymation / plasticine, candy pastel, tilt-shift macro |
| abyss | ABYSS | deep-sea horror FPS | photoreal dark, bioluminescent cyan, submarine cockpit |
| voxel-realms | VOXEL REALMS | tower defense / strategy | isometric voxel diorama, sunny, tilt-shift |
| sky-titans | SKY TITANS | mech dogfight | 90s anime cel-shading, sunset sky, speed lines |

## Steps
- [x] 1. Keyframes 2048x1152 (1080 not /16) via GPT-Image (public/landing/explore/<id>.png) → PO review
- [~] 2. Edits per PO feedback. Round 1: NO text/numbers/HUD anywhere; realistic physics; no cyberpunk/voxel/claymation.
         neon-drift, sugar-rush, voxel-realms REJECTED. inkblade-v2, abyss-v2, sky-titans-v2 generated (HUD removed, details added) → PO review. Need 3 replacement concepts.
         Round 2: knight battle REJECTED by PO. rally.png + blizzard.png generated (photoreal, no HUD) → PO review.
         Round 3: 6th game = Dishonored/Thief-style stealth (sailing battle rejected). gaslight.png generated → PO review.
- [~] 3. Seedance 2.5 clips (first_last_frames + ASPECT_RATIO adaptive, 720p; 15/20/30s)
         inkblade.mp4 REJECTED (film look, wants first-person) -> inkblade-fp.png keyframe made.
         rally.mp4, blizzard.mp4 done. abyss/gaslight 30s pending. sky-titans blocked by copyright filter (Gundam-like mech).
         Lesson: "real-time game engine capture, fixed FOV, viewmodel"; no "cinematic/film grain/DOF".
- [~] 3b. ROUND 4 — PO: ALL assets + clips rejected ("cinematic, obviously fake, not gameplay"). Regenerate every keyframe as <id>-gp.png.
         GAMEPLAY RULES (apply to every image + video prompt):
         - "unedited in-game screenshot / screen recording during normal play", real-time engine rendering (TAA softness, tiled textures, LOD foliage, SSR).
         - player camera only: FP 90° FOV eye height, or standard 3rd-person chase/shoulder cam; level horizon, no roll, no orbiting.
         - everything in focus: NO depth of field, film grain, lens flare, vignette, letterbox, colour grade. Never write "cinematic".
         - un-composed, player-centric framing; readable level design (path, cover, interactables); enemies at game distances.
         - NO text, numbers, HUD, crosshair, markings on instruments.
         - NEVER name real games/franchises in prompts; original designs only (copyright filter killed sky-titans).
         Generated: inkblade-gp, abyss-gp, sky-titans-gp (industrial mech + drones, port), rally-gp (generic hatchback), blizzard-gp, gaslight-gp (no clock tower) → PO review. Videos NOT launched until approval.
- [~] 3c. ROUND 5 — PO rejected -gp set too. Refs: .temp/upload/crimson_30s_upscaled_wm.mp4 (bright UE5 action-adventure), whk_split_30s.mp4 (bright reef sub game).
         New rules: ALL first-person, aiming, bright daylight game capture, real physics, no text/numbers.
         Generated 5: outpost (carbine ADS red-dot, Mediterranean village), wildwood (bow, jungle river, boar), reef (speargun, coral ruins, shark), rampart (crossbow, castle breach), dustline (pump shotgun, red canyon, creatures).
         Issue: model drops the centre dot crosshair (only outpost has sight dot). Proposal: add crosshair as CSS/video overlay post-gen (never drifts).
- [~] 3d. ROUND 6 — PO: ref videos are already-made; generate 5 NEW keyframes (genres): verdant (Zelda-like), shroud (stealth), railrun (train shooter), emberveil (fantasy mage), tidewalker (bright underwater sub). All generated → PO review.
         Known nits: shroud dome looks like Florence cathedral; tidewalker sub faces camera (not chase cam) + tiny badge on nose; verdant camera is side-on; railrun has motion blur at bottom.
- [ ] 4. Rebuild #explore: video bento/reel grid, autoplay muted on view, hover sound off
- [ ] 5. Ad cuts (9:16 / 1:1) if PO wants
