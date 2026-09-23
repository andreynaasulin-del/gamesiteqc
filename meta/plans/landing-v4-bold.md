---
SECTION_ID: plans.landing-v4-bold
TYPE: note
---

# Landing v4 — "bold, crazy, beat Higgsfield"

PO: the site looks very weak, even next to quadcode.ai. Reference: higgsfield.ai.

## What makes the references strong (measured)
- Higgsfield: FLAT background rgb(15,17,19), no glows. Media does the work: full-bleed
  cards, radius 20, 24px gutters, dense bento. Headings in heavy UPPERCASE, two-tone
  (white + acid lime). One loud accent used solid.
- quadcode.ai: full-bleed cinematic video hero, huge type with a serif-italic accent,
  solid orange CTA.
- Ours: plum/coral glow wash (still muddy), raw dev screenshots of games (flat blue floor,
  tiny figures), large empty dark areas, small muddy IDE shot.

## Steps
- [x] 1. Background → flat ink (#0e0f12), all glow layers gone. (atmosphere.css, tokens.css)
- [x] 2. bold.css layer (+ kinetic crossing tapes after hero, solid coral CTA banner): giant two-tone display type, solid brand accent, tighter gutters,
         section titles in brand colour, media cards radius 20.
- [x] 3. (done: split-word h2, media wipe, card spotlight+tilt, scroll bar) motion.js: scroll reveals (clip/scale), hero headline split-letter intro, parallax on
         media, magnetic/tilt cards, number counters. Respect prefers-reduced-motion.
- [ ] 4. Key art (Lumi): cinematic 16:9 art for Elemental Sandbox, Paint Strike, Rocket Arena
         + hero backdrop → public/landing/art/. Swap into the carousel.
- [ ] 5. Verify at 1440 and 390, build, facts.
