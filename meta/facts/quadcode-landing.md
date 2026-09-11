---
SECTION_ID: facts.quadcode-landing
TYPE: fact
---

# Quadcode Games landing implementation

## Files and launch
- Static, dependency-free HTML/CSS/JavaScript. No backend, billing or authentication endpoints.
- Entry: index.html; style foundation: style-guide.html.
- Shared design tokens/components: src/tokens.css.
- Section/responsive styles: src/landing.css.
- Content data, feature rendering, Carousel class, FAQ, native preview dialog and menu: src/app.js.
- All runtime assets live in public/assets, including a locally hosted League Spartan font (SIL OFL) and Lucide sparkles (ISC). License files included.
- Local preview: python3 -m http.server 4173 --bind 127.0.0.1, then http://127.0.0.1:4173/.
- No npm install/build required. Prettier was run as a one-off formatter, not a runtime dependency.
- For public hosting, deploy ONLY index.html, src/ and public/. Do not publish .temp/, meta/, uploaded PDF or research material. Static host should support byte-range requests for seeking through videos.

## Reference mapping
Higgsfield Games Intro supplied the composition: hero with side cards, alternating feature rows, dual workspace cards, large gallery, white three-step section, closing CTA, community strip, FAQ, footer. Quadcode PDF supplied font and palette: #0B0D15 / #13131E / #212233 with #FF9569 → #DD344D.
Actual measured reference/research in meta/resources/landing-design-spec.md. Screenshots are 2x DPR; compare CSS dimensions, not raw image pixels.
Intentional differences: Quadcode header/content/assets/brand; no Higgsfield testimonials, 25-million-user claim, pricing or checkout. Community guides replace testimonials. Product demonstrations are recorded gameplay, NOT embedded playable game builds. Native video controls are available after an explicit click. Download CTAs link to the official Quadcode download section, not a fake local app flow.

## Official video assets verified
Public metadata in https://quadcode.ai/_next/static/chunks/app/page-82fa3c0d84ea8236.js (research-only copy .temp/quadcode-page.js) supplies:
- /landing/samples/videos/dragon_game_864p24.mp4 → public/assets/dragon.mp4 (12.6MB)
- /landing/samples/videos/game_location_720p30.mp4 → apartment.mp4 (6.3MB)
- /landing/samples/videos/goth_room_864p24.mp4 → goth-room.mp4 (13.3MB)
- /landing/samples/videos/snake_game_864p24.mp4 → snake.mp4 (17.3MB)
- /landing/result_screens/chess/chess_3d.mp4 → chess.mp4 (1.2MB)
All downloaded from quadcode.ai unchanged. Videos have no source/loading until user opens a preview; close pauses and removes the video element and restores focus. No 50MB initial-page video download.

## Verification performed
- Node syntax check passed.
- Browser widths1424,390 inspected visually; isolated same-origin frames tested320 and768; no document horizontal overflow, no broken images.
- Desktop and mobile hero, first feature, gallery, mobile three-step section and FAQ screenshots inspected.
- Hero switching; gallery thumbnails, next/wrap, keyboard left/right; synthetic touch swipe; mobile menu and Escape; FAQ toggles; native dialog open/close and focus restoration passed.
- All local anchor targets exist; no unlabeled buttons; no pricing/checkout/payment elements.
- League Spartan loaded locally at expected400–700 weights.
- Temporary colored layout borders and console traces only injected via browser, never saved in sources; browser reload clears them.
- Initial video network requests=0. Dragon video confirmed readyState4, 1536x864,38.25s, playing without decoder error. Closing removes player, unlocks scroll and restores triggering-button focus.
- Browser console had no JS errors during tested flows.

## Known limits / next stage
- This is a branded reconstruction, not a literal pixel-identical copy: typography, header, content and game assets intentionally differ.
- Gameplay previews are recordings, not live game embeds. Verified publishable interactive-game URLs are still needed if live play on the landing is required.
- Runtime assets are local; external product/community/legal links need Internet access.
- No deployment to quadcode.ai has been performed. No commits made.
- Test actual Safari/iOS/Android devices before production; QA here used the available Chromium browser and synthetic swipe events.

## Final verification update
All five videos decoded successfully (readyState4, no media errors): Dragon38.25s, Apartment27s, Gothic45.333s, Snake38.875s, Chess13s. No player elements remain after close. Reference gallery, CTA and FAQ/footer visually reviewed at the end. Correction to the initial design handoff: Higgsfield footer is lime #D1FE17, not white; the implementation uses Quadcode's coral gradient as the corresponding full-accent footer. The reference CTA has a white surrounding section; implementation corrected to white surround with140px desktop vertical padding. Footer component screenshot: .temp/images_from_tools/0910_135639441_brw_ss.png.
