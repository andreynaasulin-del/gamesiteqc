---
SECTION_ID: plans.quadcode-landing
TYPE: plan
STATUS: completed
PRIORITY: high
---

# Quadcode landing

GOAL: Recreate Higgsfield Games Intro structure and interactions for Quadcode.ai using the supplied guidebook, without payments.

## Research
- [x] Check project rules and existing source: empty project; no rules found.
- [x] Read Guidebook Quadcode.pdf: League Spartan; #212233, #13131E, #0B0D15; white; accent #FF9569 to #DD344D; no primary black.
- [x] Review developer_import_21st_guides skill: unsuitable; imports public guides through an authenticated API, not landing-page implementation. Custom implementation needed.
- [x] Inspect both live sites, full page sections, responsive layouts, assets, links, and interactions.
- [x] Lumi established measured design specifications and downloaded eight official assets; see meta/resources/landing-design-spec.md.
- [x] Reviewed desktop hero, feature row, pair cards, steps, and mobile hero visually; DOM inspected across the full reference.
- [x] Finish visual review of gallery, CTA, FAQ, and footer during implementation.

## Implementation
- [x] Build and verify style-guide.html with shared src/tokens.css; font and official assets local; screenshot 0910_133802860_brw_ss.png.
- [x] Implement reusable responsive sections and non-payment interactions.
- [x] Keep payment, checkout, and billing out of scope.

## Verification
- [x] Browser screenshots at desktop and mobile sizes; compare against references with device pixel ratio accounted for.
- [x] Inspect console, links, keyboard navigation, reduced motion, and overflow.
- [x] Remove temporary debug traces and styling; document limitations.
