---
SECTION_ID: facts.quadcode-landing
TYPE: fact
---

# Quadcode Games landing implementation

## Preview it with Vite or not at all (2025-09-16)

**`npx vite --port 5173` → http://127.0.0.1:5173/index.html.** Nothing else.

Every landing asset lives in `public/landing/` (plus `public/brand/`), and Vite
maps `public/` to the URL root — which is why `index.html` asks for
`landing/quadcode-logo.png`, not `public/landing/quadcode-logo.png`. A plain
static server pointed at the project root has no `landing/` directory, so
**every image on the page 404s**: the header logo becomes a broken-image glyph,
and blocks built around an image collapse to their text and read as clipped or
cut off. Diagnosed exactly this way once already — the page was fine, the
server was wrong. Do not start editing CSS before checking `naturalWidth` on a
broken image and the URL in the address bar.

A production build is safe: `base: './'` keeps the references relative and
Vite copies `public/*` to `dist/` root, so `dist/landing/…` resolves.

Health check for "is the page actually broken?", run in the browser console:

```js
[...document.querySelectorAll('img')].filter(i => i.complete && !i.naturalWidth)
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

Empty array + `true` means the layout is sound. `.hero-ticker__track` is the
one element that legitimately overflows its parent (marquee inside a clipping
viewport) — ignore it in overflow audits.

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


## Pricing is a rate card, not three cards (2025-09)

`src/landing/pricing.css` owns the block. One CSS grid `.rate`: column 1 is
the label column (model families, printed once), columns 2–4 are plans; row 1
is the head (heading in the corner cell, price/CTA per plan), rows 2–7 the six
model families. `#plan-list` and `.rate__plan` are `display: contents`; app.js
writes grid coordinates inline (`--c`, `--r`) and `data-r` for row hover
(`initializeRateHover` mirrors the hovered row onto `.rate[data-row]`).
Under 900px the same nodes stack as cards, labels come from `data-label`.

Deliberately absent, do not reintroduce: per-plan checklists, "Included"
chips, discount pills, icon-in-rounded-square legends, gradient-bordered
featured card. A cell is a peach check mark (`.rate__check`, 18px stroke
icon — PO asked for more contrast than the old 8px dot, 2025-09-15), a figure
("up to 720p") or a "From Pro" pointer. Shared perks are `everyPlan()`
(plans.js) printed once in `.rate__foot`. Old card CSS is parked in
`.temp/legacy-pricing-cards.css` (not shipped).

Plan naming (decided): **Monthly / Pro / Pro yearly** — one Pro tier, two
billing terms. **`featured: true` is on `monthly-pro`** (PO decision
2025-09-15: centre column, the tier every "From Pro" cell points at). Yearly
carries no band; its billing line states the dollar saving. Head is six grid
rows (`HEAD_ROWS` in app.js = `--head-rows` in pricing.css; `.rate__head` is
`display:contents`) so caption/name/credits/price/billing/CTA align across
columns at every width. Recommended band = one `.rate__band` element spanning
all rows (`--rows` written by app.js), z-index -1, warm peach gradient
(10% → 2%), with the 2px accent rule as its ::before.

Discount scope (PO, 2025-09-15): **Monthly is sold at list** — `discount: 0`
in plans.js; `planDiscount(plan)` / `planAnchor(plan)` resolve it, app.js
renders `<s class="rate__was">` only when an anchor exists. Struck price is
18px, light grey, 2px peach strike — visible on purpose. Heading copy says
"Pro is half its regular rate", not "every plan". Test
"only the Pro terms carry a struck regular rate" guards all three.

Headline price (PO, 2025-09-15 round 2 — was showing "$15/month" on the
yearly column, a bug): `rateHeadMarkup` in app.js prints `plan.price` in
`plan.per`'s own unit, e.g. Pro yearly is **"$180 / year"**, not
`monthlyEquivalent(plan)` divided out. `monthlyEquivalent` still exists and
is still used for the "cheapest per month" comparison (`ENTRY_PLAN`,
`yearlySavings` maths) — just no longer for what gets *printed* as the
price. `planAnchor` (the struck "was" price) now matches the same unit
($360 next to $180, not $30). The yearly billing line dropped its own
"$180 billed once a year" prefix, since that figure is now the headline —
it reads "Billed once a year — <strong class="rate__save">saves $168</strong>…".

Price colour, settled 2025-09-16 after a measured comparison — **the figure
is white, only the `$` is peach**, and green is refused:

| variant | contrast on `--t-09` | vs the coral CTA below it | hue gap from accent |
|---|---|---|---|
| coral-red `#dd344d` | **3.87:1** | **1.47:1** | 12° |
| peach `#ff9569` | 8.09:1 | 1.42:1 | 15° |
| **white + peach `$`** | **17.41:1** | **3.05:1** | — |
| green `#3ddc84` | 9.76:1 | 1.71:1 | **144°** |

Red was tried for one round on PO's ask and pulled on PO's own follow-up
("красный как будто отталкивает"). The table says why: it was the *worst*
contrast of everything tested and near-identical to the CTA sitting under
it, so the price was simultaneously the hardest thing to read and in
competition with the button. White separates the two roles — number read,
button clicked. Green is out on brand, not taste: ~144° from the accent is
its near-complement, on a page whose whole palette is one coral gradient
over neutral greys (tokens.css discards three palettes over exactly this).
Where green *would* be semantically right — money saved — `.rate__save`
does the job in peach for no new hue.

Centring (finished 2025-09-16 — PO: "оцентруй все ровненько"): on desktop
**every line of a plan column sits on one axis, the column centre** —
caption, name, credits, price, billing, CTA (`text-align: center` on
`.rate__head > *`, `justify-self: center` on `.rate__cta`) and all six body
cells. Centring only the price was the half-measure that made the rest look
crooked. Verified by measurement, not by eye: all 6 head lines and all 18
cells measure **offset 0** from their column axis at 1424px and at 1000px;
axes 316px apart.

The mechanism is `grid-template-columns: 1fr auto 1fr` in **two** places,
and it is there to solve the same bug twice — a centred *flex row* centres
a whole group, so anything of variable width riding along drags the thing
that matters off-axis:
- `.rate__price` — figure group in `.rate__amount` (track 2), `.rate__was`
  in track 3. Flex-centred, the struck price ($58 / $360 / none) pulled the
  figures 22-44px apart.
- `.rate__cell` — tick in track 2, a ceiling that follows it
  (`.rate__check + .rate__cap`, "1080p") in track 3. Flex-centred, the two
  rows with ceilings kinked the tick column ~20px left of the four bare
  ticks above them. `.rate__unlock` and a lone `.rate__cap` ("up to 720p")
  take track 2, since they ARE the cell's content.

Seedance 2.0 tick removed (2025-09-16 — PO: "только галочку с сиданса можно
убрать"): that row was the table's one cell where a check mark sat beside a
ceiling ("✓ 1080p", `access.limit` on a `state: "full"` row in
`PRO_MODELS.video`, plans.js). It was also the one mark on the whole table
that read crooked — a tick fighting a digit for the same 18px. Fixed in
`rateCellMarkup` (app.js): a `full` cell with `access.limit` now renders the
figure alone, no icon (`else if (access.limit)` branch, before the plain
check branch). Every other `full` row (Code/CLI/Image/Cinema/Audio) is
unaffected — none of them carry a limit, so none of them hit that branch.
The dead `.rate__check + .rate__cap` CSS rule this made possible to delete
is gone too (pricing.css) — a cell is one mark now, never two, so nothing
needs realigning when the tick disappears; the figure was already centred on
the same axis via `.rate__cap { grid-column: 2 }`.

### The six-hour hold (2025-09-16)

PO asked for a 6h countdown on pricing and said out loud that "по факту оно
ведь ничего не значит". Placement was chosen from the funnel, not from
where a banner fits:

**The funnel**: land → watch a game → read the table → leave → download a
desktop app → sign in → think → pay, and the paying happens on
`quadcode.ai/profile/plans`, NOT on this page. So the clock cannot mean "buy
in the next six hours" — nobody can buy here at all. Its only honest job is
to put a deadline on the two struck prices at the moment the reader chooses
between acting now and "coming back later", because later is where this
funnel leaks.

**Where it lives — v2, and v1 is the lesson**: `.offer` is a direct child of
`.rate` (index.html, between `.rate__corner` and `#plan-list`) placed as
**head row 6**, spanning only the discounted columns.

v1 put it in `.rate__corner` under the "Pro is half its regular rate right
now" sentence — claim above, proof below, and level with the CTA buttons.
Right argument, dead placement: the corner is `align-self: end`, so the clock
landed in the empty band *left* of the buttons, ~200px below the prices, in
the one part of the block the eye never visits. PO: "вообще не видно его
абсолютно". **Lesson: proximity to the ARGUMENT is worth nothing next to
proximity to the NUMBER.**

v2 geometry:
- `HEAD_ROWS` 6 → **7** (caption, name, credits, price, billing, hold,
  button); `--head-rows: 7` in CSS and `.rate__cta { grid-row: 7 }` must move
  with it. `ROW_OFFSET`/`.rate__band` span derive from `HEAD_ROWS`, so body
  rows and the band needed no edits.
- `grid-column: var(--offer-col) / span var(--offer-span)`, written by
  **`placeOffer()`** in app.js from `planAnchor(plan)` — the same function
  that prints the struck prices. Currently resolves to columns 3–4. Never
  hardcode it: a literal span leaves a countdown over a plan sold at list
  the first time the order or the discount changes. Non-adjacent discounted
  plans fall back to spanning every plan column.
- **The span is the copy.** It stops at the monthly column's edge, so the
  table names the covered plans by position, like it names everything else.
  That killed the four-line explanatory note — one line now: clock icon +
  "HALF PRICE HELD FOR" + `05:44:28`.
- Still one shared clock, not per column: the discount covers 2 of 3
  columns, so a per-column timer prints one fact twice.
- Alignment is untouched because it is a ROW, not an overlay — the row just
  gets taller for all three columns. Re-verified at 1424px: all head lines
  and all 18 cells measure offset 0 from their column axis.
- Drawn like `.rate__gate` (one `rgba(255,149,105,.42)` hairline + type).
  Clock is 21px white — deliberately quiet against the 56px `$29`, and the
  label is the only peach thing in the strip.
- **<900px**: no grid, so it falls back to DOM order (under the intro, above
  the first card) as a wrapping flex row. The span no longer says anything
  there, so the phone stylesheet un-hides `.offer__scope` ("On Pro and Pro
  yearly.") — which is `.sr-only` on desktop. Matters because the first card
  under it is Monthly, the one plan the hold does *not* cover.

**Mechanic** (`src/landing/offer.js`): 6h window, deadline stored in
localStorage under `qc.offer.hold`. Armed on first INTERSECTION of the
pricing section, not on page load — arming on load means a reader who spent
four minutes on the dragon demo arrives at a clock already run down. Ticks
on the second boundary and re-derives from the deadline every tick, so a
throttled background tab never drifts. Persisting the deadline is the point:
a countdown that restarts at 06:00:00 on reload is the tell that gives every
fake timer away. A lapsed window re-arms silently rather than showing
00:00:00 beside an unchanged price. Copy says "held for", never "expires".
`hidden` until JS arms it. `.offer--soon` turns the clock peach in the last
30 min. `aria-live` region speaks whole minutes only.

**Open dependency**: the promise is currently unbacked at checkout — the
profile page knows nothing about a hold. If it ever should, pass the
deadline through the CTA link and honour it server-side.

**Height cost**: the hold is a head row, so its height comes straight off the
table's one-screen fit. Before the hold the pricing section measured exactly
789px on a 789px viewport — zero slack — so the ~47px the clock costs was
taken back from the section's own gutters:
`.pricing { --pad-y: clamp(24px, 3.3svh, 92px) }` in the one-screen media
block, against the shared `clamp(36px, 6.5svh, 92px)`. Justified: pricing is
the only section whose content is a table with a fixed row count, so air is
the only thing left to compress. Ceiling unchanged, so tall monitors are
identical. Verified: section height == 789 == viewport.

Tests: `tests/landing-offer.js` (window maths, fixed-width clock string,
the no-reset guarantee, single mount point, copy bans "expires"/"hurry").

Two breakpoint overrides, both load-bearing:
- **901-1180px**: `.rate__was` drops to its own line (`grid-row: 2`,
  centred). Its track is content-sized, so at that width `$360` grew past
  its 1fr share and shoved the figure 3-14px off-axis, differently per
  column.
- **<900px**: everything reverts to flush-left flex — `.rate__head > *`
  back to `text-align: left`, `.rate__cell` back to `display: flex` +
  `space-between` for its `::before` label. A stacked card is one column:
  there is nothing to align across, and the empty `1fr` indented the price
  52px from the name above it.

Gate row (`.rate__gate`, "PRO · opens the rest") is **switched off**
(`SHOW_GATE = false` in app.js) — PO found it redundant next to the "From Pro"
cells. Plumbing (`GATE_INDEX`, `rowFor`, CSS) is intact; flip the flag to
restore. Locked cells print `UNLOCK_LABEL` ("From Pro") in peach on a darker
fill; capped cells print "up to 720p". Row hover is `.is-row` toggled by JS
on every `[data-r]` of the row (no enumerated CSS selectors, so adding a
model needs no CSS change).


## Polish pass — six defects, and why each one existed

Found by proofreading the RENDERED copy (`innerText` of every section) and
measuring the DOM, not by reading source. Four of the six were invisible in
the source files.

1. **The yearly billing line had no final period.** All three columns sit
   side by side, so punctuation drift is the one kind you cannot miss. Cause:
   `rateHeadMarkup` hardcoded the sentence for `per === "year"` and only
   read `plan.billing` for the other two — which left `plans.js`'s own
   `billing` string for the yearly plan **permanently unread**. Editing it
   moved nothing on the page. Now every column renders `plan.billing` and
   the yearly one only splices the saving in before the period.

2. **The savings line wrapped to two lines at every desktop width.**
   "against twelve months of Pro" needed 340px in a 316px column, and
   because the billing note is a grid ROW, one column's wrap made the row
   two lines tall for all three — on a table that has to fit one screen. Now
   "vs. monthly Pro" (261px, one line), with the reference plan's name read
   from `comparedTo` so it cannot drift from the plan the arithmetic used.

3. **The pricing grid claimed ARIA table semantics it could not honour.**
   Cells carried the cell/columnheader/rowheader roles with no row or table
   role anywhere above them — impossible here, because the DOM is
   column-major (one node per plan, holding that plan's whole column) and
   `display: contents` deletes the wrapper boxes. Every engine drops a cell
   with no owning row, so the roles were decoration that also failed
   validation. Replaced with something cheaper that works: each cell's
   sr-only text is a whole sentence — `"Pro — Video · Seedance 2.0:
   included, 1080p."` — so it reads correctly wherever a reader lands. The
   label column is now `aria-hidden` (it would otherwise announce all six
   model names once before the grid and again inside each of 18 cells), and
   this also fixes the ≤1100px case where `.rate__role` is `display: none`
   but the cell sentences still name the family.

4. **`initializeReveal` matched every nested footer.** The selector was
   `main > section, footer` — a bare tag selector, so `.rate__foot` inside
   the pricing section and the prompt card's footer both got
   `.section-fade` **on top of** the `.sr` they had already earned as
   `[data-reveal]`, and two reveal transitions fought over one element. Now
   `main > section, body > footer`.

5. **The logo was squashed ~5%.** `height="38"` against a 1069×254 file
   (168px wide → 39.9px tall). CSS `height: auto` painted it correctly, so
   the only symptom was a wrong reserved box before paint. Now `height="40"`.

6. **`escExits`, not `game.id === "strike"`.** Paint Strike claims Esc for
   its own pause menu, so its card must not advertise Esc as the way out —
   but that was an id check in the renderer, which the next pointer-locking
   game would have silently got wrong. It is a field in `games.js` now.

Plus: four unescaped `&` in index.html, and `aria-hidden` on `.offer__label`
(read aloud it was a dangling "Half price held for" followed by digits that
change every second; the live region already says the whole sentence in
whole minutes).

**Locked by tests** (`tests/landing-plans.js`, +2): the billing sentence must
come from `plans.js` and stay ≤48 chars, `comparedTo` must point at a monthly
plan, and no table role may reappear in `app.js` or `index.html`. The second
test greps for role attributes, so **name those roles in prose in comments,
never as markup** — the first version of the comment failed its own test.

**Not fixed, needs Lumi**: `public/landing/games/strike.webp` is 1880×1220
where the poster box is 1880×1042. `object-fit: cover` crops it, so it looks
right and ships ~17% of its pixels for nothing. The other two posters are
1880×1042.

**Verified after**: 1424×789 and 1280×708 — section height == viewport,
0 horizontal overflow, 0 broken images, 0 squashed images, clean console,
all three billing lines one line each, all three CTAs on one band. 960×768 —
billing goes to two lines in all three columns together (correct grid
behaviour), still fits. 414px — strip falls to DOM order under the intro
with `.offer__scope` visible. `node --test tests/landing-offer.js
tests/landing-plans.js` → 18 pass.

## Agents & background v2 (PO feedback: "no avatars", "background ugly")
- Agent avatars removed completely: `public/landing/{cody,lumi,sonic}.jpg` deleted. Agents are now role icons (`code`/`palette`/`waveform` in `icons.js`) with hue classes `.agent-role--peach|coral|steel` (`--role`, `--role-soft`). Team visual = `.agent-roles` grid in `app.js`; step 02 uses `.mini-agent__mark` in `index.html`. Don't bring photos back.
- Background v3: PO rejected the grid ("AI slop") and the grey look ("dirty, cheap"). NO grid, NO grain (grain made the ink look dusty). Ramp `--t-00..11` = deep plum-ink (#09080e family); `--surface/--raised/--bg` are tinted (#13121c/#1b1a27/#0a0910), never neutral grey. Colour = saturated light pools in `atmosphere.css` `body::before`: coral rgba(255,77,94), hot orange rgba(255,122,61), plum rgba(150,48,150), blue rgba(70,100,230). `body::after` = fixed plum top sky + vignette. Low-alpha desaturated peach (#ff9569 at <0.12) goes BROWN on ink — don't use it for area fills. `.aurora::after` disabled.

## v4 "bold" (reference higgsfield.ai) — supersedes background v2/v3
- Background is FLAT `--bg #0e0f12`; `.aurora` hidden. Do not add glows/tints/grain/grid back — PO rejected all of them.
- `src/landing/bold.css` (linked last in index.html) = the visual grammar: huge uppercase two-tone type, solid coral `--hot #ff5a3c`, neutral panels + 1px inset ring, solid coral CTA banner, `.kinetic` crossing tapes after the hero.
- `src/landing/motion.js` (`initMotion()` in app.js after initializeReveal): h2 split-word rise, `.wipe` media reveal, `.spot` card spotlight/tilt, `.scroll-progress`. Reduced motion → nothing hidden.
- Large coral box-shadows read BROWN on ink — keep shadows black.
- Screenshot tool: use JS `scrollIntoView` then a plain viewport screenshot; selector screenshots of tall sections come out blank.
