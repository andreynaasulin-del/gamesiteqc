// ---------------------------------------------------------------------------
// PRICING — the games landing owns this copy.
//
// Credits are the unit a creator actually budgets in, so the credit figure is
// the headline of every card and the price sits under it. Two tiers carry the
// whole offer: 1,000 credits to get a first playable build out, 5,000 for
// people building continuously. The yearly card is the same 5,000 a month
// paid once.
//
// One discount constant, not three hand-written "was" prices: the struck
// anchor is always derived, so a price change can never leave a stale
// crossed-out number on the page.
// ---------------------------------------------------------------------------

export const PLAN_DISCOUNT = 0.5;

/** Pre-discount price shown struck through. Derived, never authored. */
export const anchorPrice = (price, discount = PLAN_DISCOUNT) =>
  Math.round(price / (1 - discount));

/** 5000 -> "5,000". Thousands separators: a five-digit credit figure with no
 *  grouping reads as a serial number. */
export const formatCredits = (credits) => credits.toLocaleString("en-US");

// ---------------------------------------------------------------------------
// MODEL LADDER. What Higgsfield's pricing page does well: a plan is not a
// number, it is a list of models with a state next to each one — included,
// capped at a resolution, or locked with the name of the tier that opens it.
// A creator scanning three cards finds the one row they care about (video?
// sound?) and the decision makes itself.
//
// Row names are model FAMILIES the public site already claims ("GPT, Claude,
// Gemini … in one environment", Veo for video, Claude Code / Codex CLIs) plus
// the generators this very landing was produced with (Seedance 2.0/2.5). No
// version numbers: a card that says "4.5" is a card somebody has to remember
// to edit the week a 4.6 ships.
//
// The GATES below are a proposal to be confirmed by the product owner —
// see the end-of-task note. They live in one place so a change is one edit.
// ---------------------------------------------------------------------------

// `role` is a one-word column label, not a sentence: the ladder reads as a
// table (ROLE · model · state) and every row stays on one line.
export const MODEL_CATALOG = [
  { id: "code", name: "GPT · Claude · Gemini", role: "Code" },
  { id: "cli", name: "Claude Code · Codex", role: "CLI" },
  { id: "image", name: "Image & UI models", role: "Image" },
  { id: "video", name: "Seedance 2.0", role: "Video" },
  { id: "video-pro", name: "Seedance 2.5 · Veo", role: "Cinema" },
  { id: "audio", name: "Music, voice & SFX", role: "Audio" },
];

/** Label on a locked row: names the tier that opens it, so a lock is a
 *  pointer, not a dead end. */
export const UNLOCK_LABEL = "From Pro";

// Per-plan access. A row is one of:
//   { state: "full" }                    — included, no ceiling
//   { state: "capped", limit: "720p" }   — included up to a ceiling
//   null                                 — locked; the chip names the tier
// Every plan must list every catalog id — the test enforces it, so a new
// model cannot silently be "missing" from a card.
const FULL = { state: "full" };
const MONTHLY_MODELS = {
  code: FULL,
  cli: FULL,
  image: FULL,
  video: { state: "capped", limit: "720p" },
  "video-pro": null,
  audio: null,
};
const PRO_MODELS = {
  code: FULL,
  cli: FULL,
  image: FULL,
  video: { state: "full", limit: "1080p" },
  "video-pro": FULL,
  audio: FULL,
};

// Headline of the access panel. The locked tier does not get "4 of 6" — a
// fraction is a score, and nobody buys a 4/6. It gets a sentence that names
// what is missing and where it opens.
export const ACCESS_PANEL = {
  partial: {
    title: "Code, image & 720p video",
    note: "Cinematic video & sound open on Pro",
  },
  full: {
    title: "Every model family",
    note: "Full line-up, no ceilings",
  },
};

export const plans = [
  {
    id: "monthly",
    name: "Monthly",
    credits: 1000,
    price: 9,
    per: "month",
    unit: "credits / mo",
    pitch: "First playable build: prototype, play, iterate.",
    billing: "Billed monthly. Cancel any time.",
    models: MONTHLY_MODELS,
    // Short, one line each: these sit under the ladder as a footer strip,
    // not a second checklist competing with it.
    features: ["All three agents", "macOS & Windows", "Your files, your repo"],
    cta: "Start monthly",
  },
  {
    id: "monthly-pro",
    name: "Monthly Pro",
    credits: 5000,
    price: 29,
    per: "month",
    unit: "credits / mo",
    // No "most popular" — we have no numbers to back that claim. The badge
    // states what the tier is for, which is true by construction.
    badge: "Built for shipping",
    featured: true,
    pitch: "Building every week: 5× the credits, every model open.",
    billing: "Billed monthly. Cancel any time.",
    models: PRO_MODELS,
    features: ["Everything in Monthly", "1080p video & full audio", "MCP & CLI integrations"],
    cta: "Go Pro",
  },
  {
    id: "yearly",
    name: "Yearly",
    credits: 5000,
    price: 180,
    per: "year",
    unit: "credits / mo",
    badge: "Lowest per credit",
    pitch: "Monthly Pro, paid once. Same credits, all twelve months.",
    billing: "One payment, twelve months of Pro.",
    // The "save $X" line under the CTA is computed against this plan, never
    // typed: see yearlySavings().
    comparedTo: "monthly-pro",
    models: PRO_MODELS,
    features: ["Everything in Pro", "Price locked 12 months", "Lowest cost per credit"],
    cta: "Go yearly",
  },
];

/** Yearly plans are compared on a per-month basis — the buyer weighs "$15 a
 *  month" against "$29 a month", not "$180" against "$29". */
export const monthlyEquivalent = (plan) =>
  plan.per === "year" ? plan.price / 12 : plan.price;

/**
 * What the yearly buyer keeps versus paying the monthly reference plan twelve
 * times. Derived from the two prices on the page, so it can never disagree
 * with them. Returns 0 when there is nothing to compare against.
 */
export function yearlySavings(plan, all = plans) {
  if (plan.per !== "year" || !plan.comparedTo) return 0;
  const reference = all.find((candidate) => candidate.id === plan.comparedTo);
  if (!reference || reference.per !== "month") return 0;
  return Math.max(0, reference.price * 12 - plan.price);
}

/**
 * Where every plan button lands: the signed-in checkout on the main site.
 *
 * This landing is the ONLY place the offer is presented — prices, credit
 * figures and the discount live in this file and nowhere else. The profile
 * page behind this link is a transaction screen, not a second pricing page;
 * if it ever starts advertising tiers again, the two will drift and one of
 * them will be wrong. Change the offer here, once.
 */
export const PLANS_URL = "https://quadcode.ai/profile/plans";
