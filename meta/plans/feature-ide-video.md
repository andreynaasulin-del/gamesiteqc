---
SECTION_ID: plans.feature-ide-video
TYPE: plan
---

# Feature slide 01 — animated IDE video instead of static screenshot

Slide: "Your idea. A real project." (`featureData[0]`, `visual: "project"`).
Story in one line: user types **"Build a 3D adventure. Make it my own."** →
GPT-6 Astra works through tools → 3D gameplay appears in the Result panel.

Rules from PO: only original Quadcode.ai UI elements (the IDE mock from the
`motion_render_ide_video` skill), model shown as **GPT-6 Astra** in the chat
box combo, message badge and status bar. No third-party branding.

## Steps

- [ ] 1. Seedance gameplay clip → `public/landing/astra-gameplay.mp4`
      (meta: `meta/files/public/landing/astra-gameplay_mp4.md`). Text-to-video,
      8 s, 16:9, 720p, stylized third-person 3D adventure, no text/HUD/logos.
- [ ] 2. Skill mock: add scenario keys `model_name` + `lang` (status bar) so the
      model reads "GPT-6 Astra" everywhere, not just on the message badge.
- [ ] 3. Scenario `motion_render_ide_video/files/scenarios/astra_adventure.yaml`:
      project tree for the adventure, send_message with the prompt, begin_answer
      (Astra) with tool calls, open_file, switch_video into `br-video`,
      camera moves, stop_record ≈ 22 s.
- [ ] 4. Preview in IDE browser (Play), fix timing, then Record → `.temp/recordings/`.
- [ ] 5. Copy the recording to `public/landing/quadcode-ide.mp4`; landing:
      replace `<img>` in `.project-window` with `<video muted loop playsinline>`
      (poster = existing webp, plays only when in view). Test + build + check 1440/390.

## Progress

(updated as steps complete)
