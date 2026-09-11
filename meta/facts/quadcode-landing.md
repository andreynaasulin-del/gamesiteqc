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


## Screen-fit layout + auto-hiding transparent header

`src/landing/screen-fit.css` (loaded last from `index.html`) is the one place
the "one block = one screen" rule lives. Everything in it is gated behind
`@media (min-width: 1001px)` — on a phone a forced `100svh` strands content
off-screen, so mobile keeps flowing normally.

- Every `main > section` is `min-height: 100svh`, flex-centred, with vh-aware
  clamps on headings, gaps and media (`clamp(floor, min(vw, svh), original)`).
- Capabilities is the exception: it is four screens, not one. The heading band
  (`--cap-band`) is a fixed slice off the top of the FIRST feature's screen and
  that feature subtracts the band from its own height, so heading + slide 01
  resolve in a single view. Slides 02/03 are full `100svh` each.
- Anything with a fixed `aspect-ratio` collapses horizontally when you cap its
  height — a height cap transfers to the inline axis. The gallery frame drops
  `aspect-ratio: auto` and crops with `object-fit: cover` instead; `.step-art`
  and `.feature-visual` get `margin-inline: auto` so they shrink centred rather
  than off their own left edge.
- Pricing cannot be scaled down (three cards × six model rows is a comparison
  table). Its two short-viewport tiers (`max-height: 880px`, then `800px`) buy
  height by deleting *repetition* only: the heading paragraph that restates the
  legend, the per-card fact line that restates it a third time, the legend's
  second line, the ladder subtitle. At `1001–1360px` the non-discount plan
  badges go too — only the Pro card's head wrapped, which knocked its price,
  CTA and ladder 26px below the other two.

Header (`.site-header`) is `position: fixed` and fully transparent — no fill,
no blur, no border — matching quadcode.ai. Because it no longer occupies flow,
`.hero` pays for it: `padding-top: calc(var(--header-h) + …)` in all four of
its rules. Hide/show is driven by scroll direction in `app.js`
(`initializeHeaderShelf`) with asymmetric timing: hiding is quick and eased-in
(380ms), showing is a slow expo-out (620ms) — the reference's exact curves are
reproduced, including the 3px blur on the hidden state.

Verified at 1424×789, 1280×768 and 430×860: every block lands at exactly one
viewport height, no console errors.

## The background is ONE layer now — `src/landing/atmosphere.css`

The "ugly stripe" between the hero and the capabilities block was not a
missing fade. `.hero` needs `overflow: hidden` (the carousel parks two
scaled cards outside its box) and the aurora's warm radial was centred at
`50% 92%` of the hero — so the hero clipped its own glow at near-peak
brightness and left a dead-straight horizontal step across the page.
Verified by toggling `.aurora { display: none }`: the stripe vanished.

**The rule now: nothing that paints light may be clipped by the element it
belongs to.** Light lives on two layers that have no internal boundaries:

| layer | position | carries |
|---|---|---|
| `body::before` | absolute, document-tall, z −1 | the 12-stop ramp + 5 radial washes |
| `body::after` | **fixed**, viewport, z −1 | feTurbulence grain |

- `<body>` has **no background** and `position: relative`. The ramp had to
  move off `<body>`: a negative-z-index child paints above the *root's*
  background but below a background painted on `<body>` itself, so a fill
  there buries both layers. `:root` keeps `background: var(--t-00)` for the
  overscroll bounce.
- Do **not** overshoot `body::before` past the document. `inset: 0` measures
  ~18px short (a margin collapses out of the footer), but an abspos child
  still feeds its container's scrollable overflow — `bottom: -80px` bought
  62px of dead scroll below the footer to hide a 2-level colour difference.
- The washes are ~7–9% of the document tall (≈700–800px of falloff) and are
  placed at **document percentages, not section edges**, so a block's light
  is still fading 300px into the next block. That overlap *is* the
  transition. The one at `50% 9%` is load-bearing: it straddles the hero's
  bottom edge and carries the warmth across.
- The aurora is masked out over its last quarter and its warm centre moved
  `92% → 76%`. Its alpha stays `0x18` — raising it to `0x21` turned the hero
  brown, because three warm layers now stack there (aurora + 9% wash +
  `--t-00/01`). Warmth is additive; the hero's two ramp stops are the only
  ones held near-neutral for this reason.
- Grain is `position: fixed` on purpose — painted once, never repaints on
  scroll. A document-tall noise tile would repaint 9000px per frame. It is
  also the *other* half of the stripe problem: an 8-bit channel moving 19
  levels over 9000px steps once every ~470px and the eye turns each step
  into a Mach band. More gradient stops cannot fix bit depth; dithering can.

### Ramp construction (`--t-00`…`--t-11`, tokens.css)
G alone drives the lightness ramp and never moves for temperature; R and B
swing in opposite directions around it:
`warm (rose) R=G+5, B=G+1` · `cool (steel) R=G-3, B=G+5` · `neutral R=G+1, B=G+1`.
Blue carries only ~7% of luminance against green's ~71%, so a warm stop and a
cool stop at the same G read as equally bright — the page changes colour
without changing depth. Warm leans **rose**, not amber: at 12% lightness a
yellow-leaning hue has no chroma left and lands as mud (the documented
orange-brown failure). Cool leans **steel, hue ~205** — the indigo/violet ban
still stands.
Oscillation is mapped to what each block does: warm where the page is human
(hero, gallery, CTA, community, footer), cool where it is technical or asks
you to decide (capabilities, workspace, workflow, pricing, FAQ).

Per-section `--glow` tokens (end of landing.css) now pick a side to match:
steel `#cfe0f0`/`#c8dcf0` on product-UI blocks, peach on the human ones. Two
stay near-white deliberately — the hero is a wall of cover art and the steps
block is illustrated; tinting the light there fights the artwork.

### Known, not fixed
A transparent fixed header means hero content passes *under* the nav when you
scroll back up into the hero (nav labels cross the h1 and the carousel
arrows). quadcode.ai has the same behaviour. Only fix would be more hero top
clearance or a faster hide — not attempted.
