---
SECTION_ID: plans.game-cards-polish
TYPE: note
---

# Game-card polish

- [x] Inspect current card render, content, and component behavior.
- [x] Define the focused UX fixes from the rendered card: make the control legend self-explanatory, give touch users an explicit full-screen cue, and preserve the existing playable-card hierarchy.
- [x] Implement modular card changes without breaking carousel/embed behavior.
- [x] Verify desktop 1440px, phone 414px, and horizontal overflow.
- [x] Run focused regression tests and record findings: 21 pass; Vite console clean.

## Style foundation

Existing landing tokens, custom typography, orange/pink accent, rounded dark
surfaces, and the current game-card component are the visual reference. No new
visual system is being invented in this pass.
