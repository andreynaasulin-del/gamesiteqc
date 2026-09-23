---
SECTION_ID: plans.elemental-mobs
TYPE: note
---

# Elemental Sandbox enemy-mob expansion

- [x] Inspect current dummy spawning, hit detection, respawn flow, and settings.
- [x] Increase the baseline encounter so the arena has more targets without changing combat rules: 6 → 10, with a wider ring and slightly tighter spacing.
- [x] Verify syntax and runtime boot: settings syntax passes; direct `play.html` boots with no console errors.
- [x] Record the shipped mob count and follow-up: 10 active targets now; distinct AI archetypes still need a separate pass.

## Scope

First pass uses the existing rig, ragdoll, hit volumes, and respawn system. No new art
assets are required. The goal is more targets and longer ability practice now; distinct
AI archetypes are a follow-up rather than pretending static dummies are enemies.
