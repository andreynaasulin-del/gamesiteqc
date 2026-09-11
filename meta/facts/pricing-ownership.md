---
SECTION_ID: facts.pricing-ownership
TYPE: note
---

# Pricing lives on the games landing — and nowhere else

**Decision (PO, final):** the offer is presented in exactly one place: the
`#pricing` section of the games landing (`index.html`). The main site's
`/profile/plans` screen must not advertise tiers; it is a signed-in
transaction screen that the landing CTAs link out to.

## Where the numbers live

`src/landing/plans.js` is the single source of truth:

| Plan        | Credits      | Price      | Anchor | Notes                      |
| ----------- | ------------ | ---------- | ------ | -------------------------- |
| Monthly     | 1,000 / mo   | $9 / month | $18    | —                          |
| Monthly Pro | 5,000 / mo   | $29 / month| $58    | featured, "Built for shipping" |
| Yearly      | 5,000 / mo   | $180 / year| $360   | "Lowest per credit"        |

No free tier. The struck-through anchor is derived from one constant
(`PLAN_DISCOUNT = 0.5`) — never hand-written, so a price change can't leave a
stale crossed-out number behind.

## Guardrails

`tests/landing-plans.js` fails if someone:

- changes the 1,000 / 5,000 credit figures,
- adds a free or $0 tier,
- marks a second card as featured,
- types a price into HTML instead of reading it from `plans.js`,
- adds a plan grid to any page other than `index.html`.

## History (don't repeat it)

Pricing was first built on the main site's `/profile/plans` page inside a
local reference copy (`sitequadcode copy/`) — the wrong project. That copy has
been deleted, along with its `.gitignore` / `.vercelignore` entries. The main
site is a **separate repository** (`git@git.neteragen.ai:neteragen/quadcodeai.git`)
and its real plan data comes from the `api.neteragen.ai` backend, which this
repo has no access to. Nothing about the offer on this landing depends on it.
