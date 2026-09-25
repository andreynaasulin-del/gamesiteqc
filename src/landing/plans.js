// ---------------------------------------------------------------------------
// PRICING — the games landing owns this copy.
//
// Credits are the unit a creator actually budgets in, so the credit figure is
// the headline of every card and the price sits under it. Two tiers carry the
// whole offer: 1,000 credits to get a first playable build out, 5,000 for
// people building continuously. The yearly card is the same 5,000 a month
// paid once.
//
// Discount logic is Higgsfield's: the MONTHLY view is list price, nothing
// struck, no discount. The ANNUAL view takes ANNUAL_DISCOUNT off every
// column, prints the per-month figure "billed annually" with the list
// price struck beside it, and states the saving in dollars.
//
// One discount constant, not hand-written "was" prices: every struck figure
// is derived, so a price change can never leave a stale number on the page.
// ---------------------------------------------------------------------------

/** Launch (half-price) discount — retired. Kept at 0 so planAnchor() is
 *  null everywhere and the six-hour hold removes itself (placeOffer). */
export const PLAN_DISCOUNT = 0;

/** Paying for a year takes this much off every plan. */
export const ANNUAL_DISCOUNT = 0.3;

/** Pre-discount price shown struck through. Derived, never authored. */
export const anchorPrice = (price, discount = PLAN_DISCOUNT) =>
  Math.round(price / (1 - discount));

/** A plan's own discount: the shared constant unless it opts out with
 *  `discount: 0`. The entry tier is sold at list — the launch offer is a
 *  Pro offer, and a struck price on every column is a struck price on none. */
export const planDiscount = (plan) => plan.discount ?? PLAN_DISCOUNT;

/** Struck regular rate for a plan, or null when it is not on offer. */
export const planAnchor = (plan) =>
  planDiscount(plan) > 0 ? anchorPrice(plan.price, planDiscount(plan)) : null;

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
// the top image/video models from the app's own pickers. Versions only where
// the picker itself prints one (Veo 3, Seedream 5 Pro).
//
// The GATES below are a proposal to be confirmed by the product owner —
// see the end-of-task note. They live in one place so a change is one edit.
// ---------------------------------------------------------------------------

// `role` is a one-word column label, not a sentence: the ladder reads as a
// table (ROLE · model · state) and every row stays on one line.
// One row per model, the way Higgsfield lists them — no bundled "X · Y"
// rows and no invented families. `cost` is credits per generation (from the
// app's own pickers); where it is known the cell prints how many of that
// generation the plan's credits buy, computed, never typed.
export const MODEL_CATALOG = [
  // Source of truth: quadcode.ai ("GPT, Claude, Gemini, Grok in one place",
  // Claude Code / Codex CLI) and the app's own image/video pickers — names
  // and qcc costs exactly as the pickers print them. Only the flagged
  // (NEW / 👍) top models; legacy and open-source rows are left out.
  { id: "claude", name: "Claude", role: "Code" },
  { id: "gpt", name: "GPT", role: "Code" },
  { id: "gemini", name: "Gemini", role: "Code" },
  { id: "grok", name: "Grok", role: "Code" },
  { id: "claude-code", name: "Claude Code", role: "CLI" },
  { id: "codex", name: "Codex", role: "CLI" },
  { id: "gpt-image", name: "GPT-Image", role: "Image", cost: 4.2, unit: "images" },
  { id: "nanobanana", name: "Nano Banana", role: "Image", cost: 9.2, unit: "images" },
  { id: "seedream", name: "Seedream 5 Pro", role: "Image", cost: 4, unit: "images" },
  { id: "seedance", name: "Seedance", role: "Video", cost: 110, unit: "videos" },
  { id: "veo-3", name: "Veo 3", role: "Video", cost: 200, unit: "videos" },
  { id: "gemini-omni", name: "Gemini Omni Flash", role: "Video", cost: 408, unit: "videos" },
  { id: "kling", name: "Kling", role: "Video", cost: 55, unit: "videos" },
];

/** "~238 images" — what a plan's monthly credits buy of one model. */
export const generationsFor = (plan, entry) =>
  entry.cost ? `~${formatCredits(Math.floor(plan.credits / entry.cost))} ${entry.unit}` : null;

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
  claude: FULL,
  gpt: FULL,
  gemini: FULL,
  grok: FULL,
  "claude-code": FULL,
  codex: FULL,
  "gpt-image": FULL,
  nanobanana: FULL,
  seedream: FULL,
  seedance: { state: "capped", limit: "720p" },
  "veo-3": null,
  "gemini-omni": null,
  kling: { state: "capped", limit: "720p" },
};
const PRO_MODELS = {
  claude: FULL,
  gpt: FULL,
  gemini: FULL,
  grok: FULL,
  "claude-code": FULL,
  codex: FULL,
  "gpt-image": FULL,
  nanobanana: FULL,
  seedream: FULL,
  seedance: { state: "full", limit: "1080p" },
  "veo-3": FULL,
  "gemini-omni": FULL,
  kling: { state: "full", limit: "1080p" },
};

export const plans = [
  {
    id: "monthly",
    name: "Monthly",
    credits: 1000,
    price: 9,
    per: "month",
    unit: "credits / mo",
    // Captions are one line each so the three names sit level; the pitch
    // is the long form for anywhere with room.
    badge: "For your first game",
    pitch: "For your first game: prototype, play, iterate.",
    billing: "Billed monthly. Cancel any time.",
    models: MONTHLY_MODELS,
    // The entry tier's features are, by construction, what EVERY plan has
    // (the other two say "everything in Monthly"). The rate card prints them
    // once, under the table, as the "every plan" line — see everyPlan().
    features: ["All three agents", "macOS & Windows", "Your files, your repo"],
    cta: "Start monthly",
  },
  // ONE Pro tier, two ways to pay for it. The two columns below are the
  // same product — same credits, same models — so they are named as such:
  // "Pro" and "Pro yearly", not "Monthly Pro" and "Yearly" as if they were
  // different things.
  //
  // The recommendation (`featured`) sits on the monthly Pro term — the
  // centre column, the tier the whole ladder points at ("From Pro"), and
  // the lowest-commitment way to get every model open. The yearly column
  // does not need a band: its price does the arguing, and its billing line
  // states the saving in dollars.
  {
    id: "monthly-pro",
    name: "Pro",
    credits: 5000,
    price: 29,
    per: "month",
    unit: "credits / mo",
    badge: "Every model unlocked",
    featured: true,
    pitch: "Building every week: 5× the credits, every model unlocked.",
    billing: "Billed monthly. Cancel any time.",
    models: PRO_MODELS,
    // "MCP & CLI integrations" used to sit here — but the CLI row is open on
    // Monthly too, so the perk contradicted the table above it.
    features: ["Everything in Monthly", "1080p video on every model", "Veo 3 & Gemini Omni"],
    cta: "Go Pro",
  },
  {
    id: "yearly",
    name: "Pro yearly",
    credits: 5000,
    price: 180,
    per: "year",
    unit: "credits / mo",
    // No "most popular" — we have no numbers to back that claim. The caption
    // states a fact the two prices above it make true.
    badge: "Best price per credit",
    pitch: "Pro, paid once. Same credits, all twelve months.",
    // Rendered as-is, with the saving spliced in before the period — see
    // rateHeadMarkup. Keep it short: the saving is what makes this line long.
    billing: "Billed once a year",
    // The "saves $X" line is computed against this plan, never typed: see
    // yearlySavings().
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

/** What a column really costs over twelve months: a yearly plan is its
 *  price, a monthly plan is twelve payments. Drives the Annual view. */
export const yearlyCost = (plan) => (plan.per === "year" ? plan.price : plan.price * 12);

/** Monthly view figure: list price per month, never discounted. */
export const listMonthly = (plan) => monthlyEquivalent(plan);

/** Annual view figure: per month, billed annually, ANNUAL_DISCOUNT off.
 *  Rounded DOWN to whole dollars so the badge never over-promises: the
 *  real discount is always at least ANNUAL_DISCOUNT. */
export const annualMonthly = (plan, discount = ANNUAL_DISCOUNT) =>
  Math.floor(listMonthly(plan) * (1 - discount));

/** What the annual term charges once a year. */
export const annualTotal = (plan) => annualMonthly(plan) * 12;

/** Dollars kept by paying annually vs. twelve months at list. */
export const annualSaving = (plan) => yearlyCost(plan) - annualTotal(plan);

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
 * What every plan has. Derived from the entry tier rather than typed a
 * second time: if Monthly gains a feature, all plans gain it, and the line
 * under the table follows without anyone remembering to edit it.
 */
export const everyPlan = (all = plans) =>
  all.reduce((low, plan) => (monthlyEquivalent(plan) < monthlyEquivalent(low) ? plan : low)).features;

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
