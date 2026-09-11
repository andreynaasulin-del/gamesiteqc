---
SECTION_ID: plans.six-abilities-performance
TYPE: note
---

# Six abilities / adaptive quality

Status: completed

Reference: existing Quadcode HUD, bundled League Spartan and approved guidebook. No redesign or new media required.
Skill review: developer_import_21st_guides concerns guide publishing, not Three.js performance; use the existing architecture.

- [x] Audit six registrations, current governor and expensive volume shaders.
- [x] Fix unclamped frame measurements, hidden-tab handling and paused recovery.
- [x] Budget raymarch steps and tighten nebula bounds without changing its field.

Desktop QA: 1424×789 CSS, DPR2. Six 5-second cast windows: ward 47, venom 54, astral 40, quake 38, ink 41, rend 60 FPS, settling on low. Final stacked-cast test: 37 FPS (six spawns, capped at 4 then immediately reduced to 2); idle 60 FPS. Not a like-for-like before/after benchmark. No universal 60 FPS claim.
Eight regression tests passed; production build passed. Keyboard Q/W/E/R/D/F and 1–6 plus six button click selections verified. Fixed laptop help/card overlap and added accessible names for glyph-only mobile buttons.
- [x] Verify six casts, tier changes, desktop/mobile HUD and fresh console.
- [x] Run regression tests and build; record measured limitations.

Final: 9/9 tests passed, latest build passed (JS gzip 365.57 KB, excluding models). Mobile window actually 390×789 CSS: 6 buttons each 56×50, no horizontal overflow, accessible names present. Synthetic touch on a valid floor point successfully cast rend; too-close points correctly rejected. Real phone GPU/touch testing and deployment remain out of scope.
Screenshots: desktop .temp/images_from_tools/0910_151747934_brw_ss.png; mobile .temp/images_from_tools/0910_151948408_brw_ss.png. Final desktop console had no errors/warnings; earlier HMR-aborted asset fetches were isolated to the editing session. No source-level debug styling or performance probes retained.

Earlier exploratory browser profiles mutated materials/visibility and are not a valid final baseline. Reload before measurements; use application frame count divided by actual wall time.
