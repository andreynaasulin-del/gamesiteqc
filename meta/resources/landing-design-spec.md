---
SECTION_ID: resources.landing-design-spec
TYPE: resource
---

# Quadcode Games landing — design handoff

## Scope and interpretation
Recreate the composition and interaction language of https://higgsfield.ai/games-intro for Quadcode.ai. Keep the landing focused on game creation. Replace branding and content using the supplied Guidebook Quadcode.pdf and verified product information from https://quadcode.ai/. NO pricing, checkout, billing selectors, payment integrations, payment CTAs or credit promotions. Do not import Higgsfield testimonials or 25-million-user claim. Do not promise automatic hosting, one-click multiplayer, or browser-only app use: these were not verified for Quadcode.

## Consulted skills
- developer_import_21st_guides: reviewed, inappropriate for a landing (authenticated 21st.dev guide importer).
- designer search returned media-generation/editing skills, no landing implementation skill. image_edit_essentials reviewed for deterministic asset inspection. Existing official assets are available, so no AI imagery needed. Bespoke HTML/CSS/JS implementation is appropriate.

## Brandbook (authoritative over live site)
Font: League Spartan, Regular 400 / Medium 500 / Semibold 600 / Bold 700.
Backgrounds: #0B0D15 base; #13131E secondary; #212233 elevated surfaces. White #FFFFFF. Coral gradient #FF9569 → #DD344D accent. Primary black explicitly forbidden. On light sections use #13131E text, not black.
Use a focus grid, glass-like depth, cubic geometry, and real interface excerpts. Subtle dotted background for feature rows and a perspective wireframe room in hero/CTA. Accent gradient on ONE PROMPT and primary action. Button labels must pass contrast: dark #13131E on a peach-dominant gradient; do not blindly use small white text over peach. All UI labels should remain readable, including muted copy.

## Reference measurements (CSS pixels, desktop viewport 1424×789, DPR 2)
Header approximately 44px high, sticky; adapt to 64px to fit Quadcode logo/navigation and accessible targets.
Hero top content starts y=140 (96px padding after header), h1 72px/72px uppercase, two centered lines; max text width 704px. CTA 48px tall, pill, 24px below headline. Media stage begins ~396px; centered card max-width 944px, aspect 944/602, radius 24px. Side cards use same box scaled .56, translated ±min(34vw,480px), opacity .82. Center z-index 3, sides 1. Transitions 700ms cubic-bezier(.22,1,.36,1). Hero section approximately 1026px at 1424 width. Grid background subtle, no huge blank area unrelated to media height.
Reference mobile: 390px CSS wide, h1 48px/48px wraps across 3 lines, top padding 64px. It uses a static combined montage, not desktop interactive iframes. Adapt our three official images into a similar compact montage; retain manual controls for accessible previews.
Section headings: 48px/56px desktop, 32px/38px mobile, uppercase. Feature titles 40px/48px desktop, 28px/34px mobile. Body 18px/26px approx; reduce to 16px/24px on mobile. Feature images ~55% of row, copy ~42%, gap 40–64px. Outer gutters 64px desktop / 16–20px mobile. Large vertical section breathing room 80–120px; feature rows have large almost-square images. Rows alternate image right/left/right. Reference feature media aspect ~2592/2200, radius 24px; feature text vertically centered, followed by 3 pill tags.

## Section mapping / copy direction
1. Compact sticky navigation: official Quadcode logo, Games (active), Capabilities, Community, FAQ, Sign in or Download; mobile menu. Omit pricing. Links to local anchors / real Quadcode URLs only.
2. Hero: CREATE GAMES / WITH ONE PROMPT. CTA Start creating. Optional concise platform hint below CTA: Desktop app for macOS & Windows. Main Dragon Flight preview; side Gothic Room and Apartment. Official gameplay previews, not fabricated product results. If interactive games cannot be embedded, clearly label preview and provide original-project link; never fake a working game.
3. Center heading POWERED BY YOUR AI TEAM. Alternating features: YOUR IDEA. A REAL PROJECT. (agents write/edit/run files in actual project); A TEAM, NOT JUST A CHATBOT (Cody code, Lumi design, Sonic motion/sound); 3D WORLDS FROM A SENTENCE (assets/environments/characters using integrated tools, not unsupported hosting claim). Three real capability tags per feature. First media can be real IDE capture inside branded frame with a restrained prompt panel; second official agent imagery; third Gothic Room / Dragon image with light glass frame.
4. Two tall cards (~430px each within 880px container) under YOUR TOOLS. / ONE CREATIVE WORKSPACE. Left MCP integrations (official icons/labels); right Quadcode Desktop (official logo on a dimensional coral app tile). White secondary CTA pills, dark text. Links to https://quadcode.ai/#integrations and https://quadcode.ai/#download. Do not imply an unverified standalone Quadcode MCP games service.
5. EXPLORE QUADCODE GAMES. Large media carousel, max-width 1312px, ratio 1312/786, radius 20px. Prev/next translucent circular controls at sides; five thumbnail buttons overlap lower edge. Reference selected thumb 90px, neighbours 68px, outer 48px. Accessible targets >=44px. Official examples Dragon Flight, Playable Apartment, Gothic Room, Snake Grass, 3D Chess. Fade transitions 340ms; keyboard left/right only while gallery focused; touch swipe; explicit labels and current state. No autoplay needed.
6. White section THREE STEPS TO A GAME. Three equal columns with large square-ish rounded illustration panels and captions below. Build the prompt → Your agents build → Play & iterate. Use DOM prompt/interface demonstrations combined with real images, not raster text. Center CTA after columns. Mobile stack. In reference section about 936px high desktop, padding80px.
7. Dark/grid CTA in rounded panel: DESCRIBE A GAME. / YOUR AGENTS BUILD THE REST. Short supporting copy about code, visuals and sound in one workspace. Start creating. No guaranteed timing claim.
8. Replace reference white testimonials section with white community proof section (same compositional rhythm, 3 horizontally scrollable cards): REAL PROJECTS. SHARED BY CREATORS. Existing guides and ready projects, link https://guides.quadcode.ai/#guides. No invented quotes or user counts. Explain variation in final report.
9. FAQ, dark: centered heading GOT ANY QUESTIONS LEFT?; max-width 884px, native details/summary, first open, plus/minus marker. Questions: What is Quadcode? Do I need to code? Why a desktop app? Can I use my own models/tools? Can it create 3D and audio? Where do I start? Answers based on real site; do not include payment topics.
10. White footer, large brand wordmark, simple columns Product / Resources / Legal. Verified links: https://quadcode.ai/privacy, https://quadcode.ai/terms, https://guides.quadcode.ai/#guides, https://quadcode.ai/#download, https://quadcode.ai/#integrations. No payment link.

## Assets downloaded (copy from .temp/downloads to public/assets before shipping)
quadcode-logo.png — official white wordmark, 52,941 bytes
quadcode-mark.svg — official standalone symbol
quadcode-ide.webp — real IDE screenshot, 107KB
Dragon: dragon.webp (40KB)
Apartment: apartment.webp (107KB)
Gothic room: goth-room.webp (88KB)
Snake: snake.webp (167KB)
Chess: chess.webp (22KB)
All source paths verified by downloads from https://quadcode.ai/landing/.
Contact sheet .temp/images_from_tools/0910_132955568_cmp_img.png confirms images. Dragon sunset/orange palette fits coral brand. IDE screenshot is nearly empty in central workspace: use as supporting evidence, not sole full-hero visual.
More official assets discovered: /landing/avatars/cody.jpg, /landing/avatars/aiagent1.jpg (Lumi), /landing/avatars/sonic.jpg, /landing/avatars/team_leader.jpg; /landing/icons/mcp/figma.svg, /landing/icons/mcp/github.svg, /landing/icons/cli/claude-code.svg. Download via ToolDownloadFile to .temp then copy locally.
Original site has videos /videos/quadcode_chat_only.mp4 and /landing/videos/feat_agent_crew.mp4; playback source for individual game demos not yet obtained, don't guess URLs. Existing IDs #make-alive, #interactive-experiences for original interactive content.

## Browser references and limitations
higgs-desktop: window 1440x1000 produced actual CSS viewport1424x789 at DPR2. tab mode higgsfield-reference reported tiny hidden viewport261x30 and blank screenshots; don't use it for visuals.
higgs-mobile: window390x844 yields correct mobile screenshot.
quadcode-reference: main site tab, DOM readable, currently scrolled to game section and Dragon Flight selected. Videos may be lazy when hidden; open a standalone window to inspect if necessary.
Desktop screenshots: hero 0910_132722298_brw_ss.png; feature 0910_132808750_brw_ss.png; pair cards 0910_132841248_brw_ss.png; steps 0910_132924550_brw_ss.png. Mobile hero 0910_133052355_brw_ss.png. All in .temp/images_from_tools/.
Higgs DOM sections temporarily given IDs reference-section-0 through10. 0 hero;1–3features;4pair;5gallery;6steps;7CTA;8testimonials;9pricing(exclude);10FAQ. Entire DOM content/structure read. Still useful to visually verify CTA/FAQ/footer and gallery.

## Build and QA
First create a local style-guide sample, then implement responsive landing using those shared tokens. Empty repo, no framework requirement: dependency-free HTML/CSS/JS is appropriate and straightforward to preview. Static landing is not a Quadcode IDE panel: DO NOT use QC bridge or ui_views.
Real functional controls: mobile menu, hero/gallery selection, FAQ, working outbound CTA or accessible download dialog with real links. Do not create fake sign-in forms. Avoid dead buttons. External video/iframe load on intent only; use local posters and lazy loading. Respect reduced motion, keyboard focus, Escape/restore focus for dialogs, and video pause outside viewport.
Validate at 1440/768/390/320 widths, no horizontal overflow; check all images, links, console; test active state and navigation. No payment dependency or Stripe. Document intentional brand/content deviations, do not claim literal pixel equality. Keep plan updated during implementation.
