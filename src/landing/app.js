import { GameCard } from "./hero-game.js";
import { games, gameAsset } from "./games.js";
import { icon, hydrateIcons } from "./icons.js";
import { initializeOffer } from "./offer.js";
import { initializeDeal } from "./deal.js";
import { initTestimonials } from "./testimonials.js";
import { initMotion } from "./motion.js";
import { initShowreel } from "./showreel.js";
import { paywallMarkup, initPaywallClock, initPaywallToggle } from "./paywall.js";
import {
  plans,
  planAnchor,
  formatCredits,
  yearlySavings,
  monthlyEquivalent,
  MODEL_CATALOG,
  UNLOCK_LABEL,
  everyPlan,
  PLANS_URL,
} from "./plans.js";

// Content is sourced from Quadcode AI's public showcase, not generated customer claims.
const asset = (name) => `landing/${name}`;

const projects = [
  {
    title: "Dragon Flight",
    category: "3D · Flying game",
    image: "dragon.webp",
    alt: "Dragon flying over a volcanic world at sunset",
    description:
      "A flying game set above a volcanic landscape. An example from the Quadcode AI game and 3D showcase.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Playable Apartment",
    category: "3D · Interactive world",
    image: "apartment.webp",
    alt: "A detailed, sunlit apartment with a kitchen and living room",
    description:
      "A furnished apartment you can explore in the browser. See the original interactive experience in the Quadcode AI showcase.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Gothic Room",
    category: "3D · Environment",
    image: "goth-room.webp",
    alt: "A candlelit gothic hall with stained-glass windows",
    description:
      "A real-time 3D environment with stained glass, candlelight and editable scene settings.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Snake Grass",
    category: "3D · Locomotion demo",
    image: "snake.webp",
    alt: "The Snake Grass game shown in the Quadcode AI showcase",
    description:
      "A real-time snake locomotion demo with steering, sprinting, a cobra pose and tree climbing. This is a capture from the running project, including its developer HUD.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "3D Chess",
    category: "Game · WebGL",
    image: "chess.webp",
    alt: "Three-dimensional chess game with a rendered chessboard",
    description:
      "A 3D chess project from the software examples on Quadcode AI. Explore the game in the original developer showcase.",
    url: "https://quadcode.ai/#capabilities",
  },
];
// No portraits: each agent is its role mark + name. `hue` tints the tile.
const agents = [
  { name: "Cody", role: "Code & development", glyph: "code", hue: "peach" },
  { name: "Lumi", role: "Design & visuals", glyph: "palette", hue: "coral" },
  { name: "Sonic", role: "Motion & sound", glyph: "waveform", hue: "steel" },
];
const featureData = [
  {
    title: "Your idea,<br>real files.",
    copy: "Describe the game you want. Agents write the code, make the assets and run the build inside your project folder, so everything stays yours.",
    tags: ["Code and assets", "Runs locally"],
    visual: "project",
  },
  {
    title: "3D worlds from<br>a sentence.",
    copy: "Describe a place, a character or a whole world. Built-in 3D tools turn it into assets you can drop straight into your game.",
    tags: ["3D assets", "Environments", "Characters"],
    visual: "world",
  },
];
const faqData = [
  [
    "What is Quadcode AI?",
    "Quadcode AI is a desktop creative workspace where specialized AI agents help you build games, apps, websites, visuals and audio. They open, edit and run the files in your project folder.",
  ],
  [
    "Do I need to know how to code?",
    "You can start by describing your idea in plain language. Your agents help with the implementation. If you write code, you can inspect and edit the project directly, use Git and debug it in the same workspace.",
  ],
  [
    "Why a desktop app, not a browser tab?",
    "The app works directly in your project folder. Agents can read and write files, run build steps and use local tools such as Unity, Blender and your command-line programs. Quadcode AI is available for macOS and Windows.",
  ],
  [
    "Can I use my own models and tools?",
    "Quadcode AI supports multiple model providers and connects to tools through MCP and local integrations. You can also orchestrate agentic CLIs such as Claude Code and Codex alongside your existing workflow.",
  ],
  [
    "Can it help with 3D, music and sound?",
    "Yes. Specialized agents work with integrated models and tools for 3D assets, images, animation, voice, music and sound effects. The exact workflow depends on your project and the tools you choose.",
  ],
  [
    "Where should I start?",
    "Get the Quadcode AI desktop app, open a project and describe what you want to build.",
  ],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
// Chip marks (Lucide, same set as the buttons) instead of peach dots.
const TAG_ICONS = {
  "Code and assets": "file-code",
  "Runs locally": "laptop",
  "Specialized agents": "bot",
  "Shared context": "link",
  "Any model": "cpu",
  "3D assets": "box",
  Environments: "mountain",
  Characters: "user",
};
const tags = (items) =>
  `<div class="tags">${items
    .map((item) => `<span class="tag">${icon(TAG_ICONS[item] || "sparkles", "i tag-icon")}${escapeHtml(item)}</span>`)
    .join("")}</div>`;

function featureVisual(type) {
  if (type === "project") {
    return `<div class="project-window screencast"><video class="project-window__video" data-feature-video src="${asset("ide/tidecliff-recording-battle-cut.mp4")}" poster="${asset("ide/tidecliff-recording-clean.jpg")}" width="2848" height="1336" muted loop playsinline preload="metadata" aria-label="Quadcode AI desktop interface: a prompt is typed, GPT-6 Astra edits the project files, and the running game appears in the Result tab"></video></div>`;
  }
  if (type === "team") {
    return `<div class="team-composition"><div class="team-label">One brief, three specialists</div><ul class="agent-roles">${agents.map((agent) => `<li class="agent-role agent-role--${agent.hue}"><span class="agent-role__mark">${icon(agent.glyph)}</span><strong>${agent.name}</strong><span>${escapeHtml(agent.role)}</span></li>`).join("")}</ul><div class="team-prompt">All of them work in the same project</div></div>`;
  }
  // Topic 03 creative: the island grows out of an empty glass slab; the
  // sentence is real HTML typed onto that slab (AI text would smear).
  return `<picture><source srcset="${asset("topic03-world.webp")}" type="image/webp"><img src="${asset("topic03-world.jpg")}" alt="A floating island with a castle, waterfall and dragon being generated from a single typed sentence" width="2048" height="1152" loading="lazy" decoding="async"></picture><div class="world-prompt" aria-hidden="true"><img class="world-prompt__ui" src="${asset("ide/composer-opus.webp")}" alt="" width="1126" height="406" loading="lazy" decoding="async"><div class="world-prompt__line"><span class="world-prompt__text" data-world-type></span><span class="world-prompt__caret"></span></div></div>`;
}

// ---- Pricing: the rate card ------------------------------------------------
// One table, typeset. Plans are columns, model families are rows, and each
// fact appears exactly once: the six model names live in the left-hand
// column, not repeated inside three cards; the discount is one sentence in
// the heading, not three "50% OFF" pills; the shared perks are one line
// under the table. What remains in a plan's column is only what differs —
// which is the whole reason a buyer is comparing.
//
// Markup is column-major (one .rate__plan per plan) so a phone can stack the
// plans as cards, but each cell carries its grid coordinates so on desktop
// the same nodes lay out row-major inside the shared `.rate` grid. Column 1
// is the label column.
//
// The head is not one grid row but seven — caption, name, credits, price,
// billing, the hold, button — so that the three columns align line by line
// no matter how a caption or a billing note wraps at a given width. (A
// single head row bottom-aligns the buttons and lets everything above them
// drift.) Row 6 is the offer strip: it spans only the discounted columns,
// but it is still a ROW, so adding it cost the alignment nothing — the row
// just gets taller for all three.
const HEAD_ROWS = 7;
const ROW_OFFSET = HEAD_ROWS + 1;
const COL_OFFSET = 2;

// THE GATE. This block is a paywall, and a paywall has a line in it: above
// the line, what the entry tier buys; below it, what only the next tier
// opens. The line is drawn once, as its own row of the ledger — a printed
// rate card would set "Pro" as a sub-heading and list the rest under it.
// Its position is derived from the entry tier's first locked family, so
// re-gating a model in plans.js moves the line without touching markup.
const ENTRY_PLAN = plans.reduce((low, plan) =>
  monthlyEquivalent(plan) < monthlyEquivalent(low) ? plan : low,
);
const GATE_INDEX = MODEL_CATALOG.findIndex((entry) => ENTRY_PLAN.models[entry.id] == null);
// The gate row is switched off: the "From Pro" cells already draw the line
// column by column, and a second, full-width "PRO · opens the rest" row
// said the same thing once more and cost a row of height. Flip to
// `GATE_INDEX > 0` to bring it back — all the plumbing below still works.
const SHOW_GATE = false;
const HAS_GATE = SHOW_GATE && GATE_INDEX > 0;
const GATE_LABEL = UNLOCK_LABEL.replace(/^from\s+/i, "");
// Grid row for catalog index i: rows above the gate are unchanged, rows at
// or below it shift down one to make room for the gate row.
const rowFor = (index) => index + ROW_OFFSET + (HAS_GATE && index >= GATE_INDEX ? 1 : 0);
const GATE_ROW = GATE_INDEX + ROW_OFFSET;

// A cell is one of three things, none of them a chip:
//   full    → a check mark — or, when the row also carries a ceiling
//             ("1080p"), the figure ALONE and no mark. A tick next to a
//             number claims two things at once ("included" AND "here is
//             how much"), and on this table's one such row — Seedance
//             2.0 on the Pro columns — the two read as fighting for the
//             same 18px: the tick sits sideways against the baseline of
//             the digits beside it, which is the only crooked mark in a
//             table that is otherwise all straight lines. The figure
//             already says "included, and this is the ceiling" on its
//             own — same grammar "up to 720p" already uses one state
//             down, just without "up to" because here there ISN'T one.
//   capped  → "up to 720p" — the ceiling IS the state, and "up to" says so
//   locked  → the tier that opens it, in the accent: the cell names the
//             price of entry instead of shrugging with a dash. That is the
//             paywall doing its job — every locked cell is a pointer to the
//             column on its right.
// NO ARIA TABLE ROLES IN HERE, DELIBERATELY. This markup used to carry the
// cell, columnheader and rowheader roles, which is invalid: each of them
// requires a row role inside a table role on an ancestor, and this grid has
// neither — the DOM is column-major (one element per plan holding that
// plan's whole column) and `display: contents` removes the wrapper boxes
// anyway. A cell with no owning row is dropped from the accessibility tree
// by every engine, so the roles bought nothing and failed validation.
// (tests/landing-plans.js greps for those role attributes, so name them in
// prose here, not as markup.)
// What replaces them is cheaper and actually works: every cell's sr-only
// text is a COMPLETE sentence — plan, feature, verdict — so it reads
// correctly wherever a screen reader lands, with no row/column context to
// reconstruct.
function rateCellMarkup(entry, access, column, row, plan) {
  const locked = access == null;
  const capped = !locked && access.state === "capped";
  const placement = `style="--c:${column};--r:${row}" data-r="${row}"`;
  const label = `${entry.role} · ${entry.name}`;
  let glyph;
  let verdict;
  if (locked) {
    glyph = `<span class="rate__unlock">${icon("lock", "i rate__lock")}${escapeHtml(UNLOCK_LABEL)}</span>`;
    verdict = `not included, ${UNLOCK_LABEL.toLowerCase()}`;
  } else if (capped) {
    glyph = `<span class="rate__cap"><span class="rate__upto">up to</span> ${escapeHtml(access.limit)}</span>`;
    verdict = `included, up to ${access.limit}`;
  } else if (access.limit) {
    glyph = `<span class="rate__cap">${escapeHtml(access.limit)}</span>`;
    verdict = `included, ${access.limit}`;
  } else {
    glyph = icon("check", "i rate__check");
    verdict = "included";
  }
  const sr = `${plan.name} — ${label}: ${verdict}.`;
  return `<div class="rate__cell${locked ? " rate__cell--off" : ""}" ${placement} data-label="${escapeHtml(label)}">${glyph}<span class="sr-only">${escapeHtml(sr)}</span></div>`;
}

// The gate row inside a plan column. Empty on desktop — the label column
// carries the words — but it has to exist so the recommended column's band
// runs unbroken through the line. On a phone each stacked card prints its
// own version: the entry tier says what is below the line is not on this
// plan, the others say the line is where their extra value starts.
function rateGateCellMarkup(plan, column) {
  const opens = MODEL_CATALOG.slice(GATE_INDEX).every((entry) => plan.models[entry.id] != null);
  const text = opens ? `${GATE_LABEL} models — included` : `${GATE_LABEL} models — not on ${escapeHtml(plan.name)}`;
  return `<div class="rate__gate rate__gate--cell${opens ? " rate__gate--open" : ""}" style="--c:${column};--r:${GATE_ROW}" aria-hidden="true"><span>${text}</span></div>`;
}

// Head of a column. Reading order, top to bottom: what the tier is for
// (caption, plain text), its name, the credits (the figure being compared),
// the price per month with the regular rate struck beside it, the billing
// line, and the button — inline-width, so three different labels sit as
// three buttons rather than three identical bars.
function rateHeadMarkup(plan, column) {
  // The headline figure is what the plan is actually billed AT, in its own
  // unit — $9/month, $29/month, $180/year. It used to be $180 divided by
  // twelve ("$15/month") on the yearly column: that number is the
  // per-month *comparison* figure (see monthlyEquivalent, still used for
  // that maths elsewhere), not a price anyone is charged, and printing it
  // as THE price read as "Pro yearly costs $15 a month".
  const price = plan.price;
  const perUnit = plan.per === "year" ? "year" : "month";
  // Struck regular rate, in the same unit as the price beside it — only on
  // plans that are actually on offer. Monthly is sold at list, so its price
  // stands alone.
  const anchor = planAnchor(plan);
  const was = anchor == null ? "" : `<s class="rate__was" aria-label="Regular price">$${anchor}</s>`;
  const savings = yearlySavings(plan);
  // "$180" is not repeated here — it is already the headline figure above.
  // The saving is the yearly column's one hook, so the figure is lifted out
  // of the sentence into the accent rather than left as grey body text.
  // The sentence itself comes from plans.js on EVERY column; the yearly one
  // only splices the saving into it. It used to be hardcoded here for
  // `per === "year"`, which left that plan's own `billing` string in
  // plans.js permanently unread — edit it and nothing on the page moved.
  // The period is re-attached after the splice so all three columns end
  // with one, the yearly one included (it did not before).
  // `savings` is a number and the base is escaped, so this is safe to
  // interpolate as markup.
  // "against twelve months of Pro" was the same claim in nine words and it
  // wrapped to a second line at every desktop width — so the billing row
  // was two lines tall in all three columns to serve one of them, on a
  // table that has to fit one screen. "vs. monthly Pro" fits on one line at
  // 316px and names the reference plan, which is read from `comparedTo`
  // rather than typed, so it cannot drift from the plan the saving is
  // actually computed against.
  const base = escapeHtml(plan.billing).replace(/\.\s*$/, "");
  const reference = plans.find((candidate) => candidate.id === plan.comparedTo);
  const billing = savings
    ? `${base} — <strong class="rate__save">saves $${savings}</strong> vs. monthly ${escapeHtml(reference?.name ?? "Pro")}.`
    : `${base}.`;
  return `<header class="rate__head" style="--c:${column}">
    <p class="rate__caption">${plan.badge ? escapeHtml(plan.badge) : escapeHtml(plan.pitch)}</p>
    <h3 class="rate__name">${escapeHtml(plan.name)}</h3>
    <p class="rate__credits"><strong>${formatCredits(plan.credits)}</strong> credits a month</p>
    <p class="rate__price">
      <span class="rate__amount"><span class="rate__currency">$</span><strong>${price}</strong><span class="rate__per">/ ${perUnit}</span></span>
      ${was}
    </p>
    <p class="rate__billing">${billing}</p>
    <a class="button small${plan.featured ? "" : " secondary"} rate__cta" href="${PLANS_URL}">${escapeHtml(plan.cta)} ${icon("arrow-right")}</a>
  </header>`;
}

function ratePlanMarkup(plan, index) {
  const column = index + COL_OFFSET;
  const cells = MODEL_CATALOG.map((entry, i) => {
    const cell = rateCellMarkup(entry, plan.models[entry.id], column, rowFor(i), plan);
    return HAS_GATE && i === GATE_INDEX ? rateGateCellMarkup(plan, column) + cell : cell;
  }).join("");
  // The recommended column's band: one element spanning every row.
  const band = plan.featured
    ? `<i class="rate__band" style="--rows:${rowFor(MODEL_CATALOG.length - 1)}" aria-hidden="true"></i>`
    : "";
  return `<div class="rate__plan${plan.featured ? " rate__plan--featured" : ""}" data-plan="${plan.id}" style="--c:${column}">${band}${rateHeadMarkup(plan, column)}${cells}</div>`;
}

// The label column is rendered once. On a phone it is hidden and every cell
// carries its own label (data-label → ::before). The gate line sits in this
// column too: "Pro" with a rule, the way a ledger sets a sub-heading.
function rateLabelsMarkup() {
  const last = MODEL_CATALOG.length - 1;
  return MODEL_CATALOG.map((entry, i) => {
    const row = rowFor(i);
    // aria-hidden, because every cell's sr-only sentence already names its
    // own feature ("Pro — Video · Seedance 2.0: included"). Left readable it
    // would announce all seven model names once before the grid and then
    // again inside each of the twenty-one cells.
    const label = `<div class="rate__label${i === last ? " rate__label--last" : ""}" style="--r:${row}" data-r="${row}" aria-hidden="true"><span class="rate__role">${escapeHtml(entry.role)}</span><span class="rate__model">${escapeHtml(entry.name)}</span></div>`;
    if (!HAS_GATE || i !== GATE_INDEX) return label;
    const gate = `<div class="rate__gate rate__gate--label" style="--r:${GATE_ROW}"><span>${escapeHtml(GATE_LABEL)}</span><span class="rate__gate-note">opens the rest</span></div>`;
    return gate + label;
  }).join("");
}

function rateMarkup() {
  return rateLabelsMarkup() + plans.map(ratePlanMarkup).join("");
}

// THE HOLD'S SPAN. The offer strip is only honest if it covers exactly the
// columns whose price is struck, so its grid placement is derived from the
// same `planAnchor` that prints those struck prices — re-price a tier in
// plans.js and the strip follows. Hardcoding "columns 3 to 4" would leave
// a timer sitting over a plan sold at list the first time the order or the
// discount changes, which is the kind of lie a reader catches instantly.
// If the discounted plans are ever NOT adjacent, a single strip cannot
// describe them: it falls back to spanning every plan column, where it
// says "this table has an offer on it" and the struck prices say which.
function placeOffer() {
  const rate = $(".rate");
  const offer = $("[data-offer]");
  if (!rate || !offer) return;
  const columns = plans
    .map((plan, index) => (planAnchor(plan) == null ? null : index + COL_OFFSET))
    .filter((column) => column != null);
  // Nothing on offer: no clock. The alternative is a countdown on full
  // price, which is the whole genre of fake urgency this thing avoids.
  if (!columns.length) {
    offer.remove();
    return;
  }
  const first = Math.min(...columns);
  const adjacent = Math.max(...columns) - first + 1 === columns.length;
  rate.style.setProperty("--offer-col", adjacent ? first : COL_OFFSET);
  rate.style.setProperty("--offer-span", adjacent ? columns.length : plans.length);
}

// Row hover across a grid of siblings: CSS cannot select "the other cells
// in my row", so the hovered row index is mirrored to the grid root and a
// [data-r] match lights the whole line — label included.
function initializeRateHover() {
  const rate = $(".rate");
  if (!rate || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let lit = [];
  const clear = () => {
    lit.forEach((el) => el.classList.remove("is-row"));
    lit = [];
  };
  rate.addEventListener("pointerover", (event) => {
    const cell = event.target.closest("[data-r]");
    if (!cell || (lit[0] && lit[0].dataset.r === cell.dataset.r)) return;
    clear();
    lit = [...rate.querySelectorAll(`[data-r="${cell.dataset.r}"]`)];
    lit.forEach((el) => el.classList.add("is-row"));
  });
  rate.addEventListener("pointerleave", clear);
}

function renderContent() {
  $("#feature-list").innerHTML = featureData
    .map(
      (feature, index) =>
        `<article class="feature"><div class="container feature-inner"><div class="feature-copy" data-reveal><span class="feature-number">0${index + 1}</span><h3>${feature.title}</h3><p>${escapeHtml(feature.copy)}</p>${tags(feature.tags)}</div><div class="feature-visual visual-${feature.visual}" data-reveal>${featureVisual(feature.visual)}</div></div></article>`,
    )
    .join("");
  $("#plan-list").innerHTML = paywallMarkup();
  $("#rate-every-plan").innerHTML =
    `<strong>Every plan:</strong> ${everyPlan().map(escapeHtml).join(" · ")}.`;
  $("#faq-list").innerHTML = faqData
    .map(
      ([question, answer], index) =>
        `<details class="faq-item" data-reveal${index === 0 ? " open" : ""}><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`,
    )
    .join("");
  $("#year").textContent = new Date().getFullYear();
}

// Shared cyclic selection, keyboard and swipe behavior for both galleries.
class Carousel {
  constructor(root, count, onChange) {
    this.root = root;
    this.count = count;
    this.index = 0;
    this.onChange = onChange;
    this.start = null;
    root.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      this.move(event.key === "ArrowLeft" ? -1 : 1);
    });
    root.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        this.start = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      },
      { passive: true },
    );
    root.addEventListener(
      "touchend",
      (event) => {
        if (!this.start) return;
        const deltaX = event.changedTouches[0].clientX - this.start.x;
        const deltaY = event.changedTouches[0].clientY - this.start.y;
        this.start = null;
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5)
          this.move(deltaX < 0 ? 1 : -1);
      },
      { passive: true },
    );
    root.addEventListener("touchcancel", () => {
      this.start = null;
    });
  }
  select(index) {
    this.index = ((index % this.count) + this.count) % this.count;
    this.onChange(this.index);
  }
  move(step) {
    this.select(this.index + step);
  }
}

// ---- Hero: one card per game in the registry -------------------------------
const pad = (n) => String(n).padStart(2, "0");

function controlsMarkup(controls = []) {
  return `<div class="hero-game__controls-wrap" aria-label="Desktop controls"><p class="hero-game__controls-label">Controls</p><ul class="hero-game__controls">${controls
    .map(
      (row) =>
        `<li>${row.keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join("")}<span>${escapeHtml(row.label)}</span></li>`,
    )
    .join("")}</ul></div>`;
}

// 1880×1042 is the POSTER BOX's aspect (the card at 2× density), not a
// promise about the file: the image is `object-fit: cover` inside a
// CSS-sized box, so a taller export is simply cropped. Declaring the box
// here keeps the reserved space right whatever the export measures — but an
// export that is not 16:9-ish is shipping pixels `cover` throws away, so
// keep new posters at this ratio.
// The first card is the LCP candidate and must not be lazy; the other two
// are off to the sides and must not compete with it.
function posterMarkup(game, index) {
  return `<img class="hero-game__poster-img" src="${gameAsset(game.poster)}" alt="${escapeHtml(game.posterAlt ?? "")}" width="1880" height="1042" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
}

function gameCardMarkup(game, index, total) {
  const position = index === 0 ? "center" : index === 1 ? "right" : index === total - 1 ? "left" : "back";
  const action = `<a class="button hero-game__play" data-game-play href="${game.embed}" aria-label="Play ${escapeHtml(game.title)}"><span class="hero-game__play-icon" aria-hidden="true">${icon("play")}</span><span data-game-play-label>Play</span></a>`;
  return `<article class="hero-card hero-card--game" data-game="${game.id}" data-state="preview" data-position="${position}" aria-roledescription="slide" aria-label="${index + 1} of ${total}: ${escapeHtml(game.title)}, playable">
    <div class="hero-game__mount" data-game-mount></div>
    <div class="hero-game__poster" data-game-poster>${posterMarkup(game, index)}</div>
    <div class="hero-game__chip"><span>${pad(index + 1)}</span>${escapeHtml(game.category)}</div>
    <button class="hero-game__exit" type="button" data-game-exit aria-label="Exit ${escapeHtml(game.title)}">${game.escExits === false ? "" : "<kbd>Esc</kbd>"}Exit ${icon("x")}</button>
    <!-- Reading order is the point of this structure. Play used to be the
         copy block's second child, bottom-aligned against a column that
         ended in two rows of keyboard chips — so the page's second most
         important action shared a baseline with its least important line
         and sat 170px away from the sentence that sells it. It now closes
         the left column: title, one sentence, button. The key legend is a
         legend, so it goes to the right and stays out of the path. -->
    <div class="hero-card-copy hero-game__copy">
      <div class="hero-game__pitch">
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.description)}</p>
        ${action}
        <span class="hero-game__status" data-game-status aria-live="polite"></span>
        <span class="hero-game__device-note">Tap Play to open full screen</span>
      </div>
      ${controlsMarkup(game.controls)}
    </div>
    <button class="hero-card-cover" aria-label="Show ${escapeHtml(game.title)}" data-featured="${index}"></button>
  </article>`;
}

function initializeHero() {
  const total = games.length;
  $("#hero-cards").innerHTML = games
    .map((game, index) => gameCardMarkup(game, index, total))
    .join("");
  const cards = $$(".hero-card--game");
  const controllers = cards.map((card, index) => new GameCard(card, games[index]));
  // Moving a card between the two side slots means crossing the entire deck.
  // Animated, that is a dimmed card sliding ~1000px through the middle of
  // the composition, behind the one the viewer is actually looking at — the
  // single biggest reason switching felt untidy. So that one card cuts
  // instead: fade out, jump while invisible, fade back in. The two cards
  // that matter (the one arriving at the centre and the one leaving it)
  // still travel, so the deck reads as continuous.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const OPPOSITE = { left: "right", right: "left" };
  const setPosition = (card, next) => {
    const previous = card.dataset.position;
    if (previous === next) return;
    if (reduced.matches || OPPOSITE[previous] !== next) {
      card.dataset.position = next;
      return;
    }
    card.classList.add("is-hopping");
    clearTimeout(card.hopTimer);
    card.hopTimer = setTimeout(() => {
      card.dataset.position = next;
      // Force the teleport to land in its own style flush, otherwise the
      // browser coalesces it with the class removal below and animates the
      // very slide we are trying to avoid.
      void card.offsetWidth;
      card.classList.remove("is-hopping");
    }, 190);
  };

  const controller = new Carousel($(".hero-showcase"), total, (active) => {
    cards.forEach((card, index) => {
      const distance = (index - active + total) % total;
      setPosition(
        card,
        distance === 0 ? "center" : distance === 1 ? "right" : distance === total - 1 ? "left" : "back",
      );
      $(".hero-card-cover", card).setAttribute(
        "aria-label",
        `${distance === 0 ? "Selected: " : "Show "}${games[index].title}`,
      );
      controllers[index].setCentered(distance === 0);
    });
    $("#hero-counter").textContent = `${pad(active + 1)} / ${pad(total)}`;
  });
  $("#hero-counter").textContent = `01 / ${pad(total)}`;
  $("[data-hero-prev]").addEventListener("click", () => controller.move(-1));
  $("[data-hero-next]").addEventListener("click", () => controller.move(1));
  $$("[data-featured]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.featured);
      if (index !== controller.index) controller.select(index);
    }),
  );
  // Opened with #play (e.g. from the nav CTA): start the first game at once.
  if (location.hash === "#play" && games[0].status === "live") controllers[0].play();
}

function initializeGallery() {
  $("#gallery-thumbnails").innerHTML = projects
    .map(
      (project, index) =>
        `<button class="gallery-thumb" aria-label="Show ${project.title}" aria-current="${index === 0}" data-project="${index}"><img src="${asset(project.image)}" alt="" width="90" height="90" loading="lazy"></button>`,
    )
    .join("");
  const image = $("#gallery-image");
  const controller = new Carousel($(".gallery"), projects.length, (index) => {
    const project = projects[index];
    image.src = asset(project.image);
    image.alt = project.alt;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      image.getAnimations().forEach((animation) => animation.cancel());
      image.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 340,
        easing: "ease-out",
      });
    }
    $("#gallery-title").textContent = project.title;
    $("#gallery-category").textContent = project.category;
    $("#gallery-status").textContent =
      `${project.title} · ${index + 1} of ${projects.length}`;
    $$(".gallery-thumb").forEach((thumb, thumbIndex) =>
      thumb.setAttribute("aria-current", String(thumbIndex === index)),
    );
  });
  $(".gallery-prev").addEventListener("click", () => controller.move(-1));
  $(".gallery-next").addEventListener("click", () => controller.move(1));
  $$("[data-project]").forEach((button) =>
    button.addEventListener("click", () =>
      controller.select(Number(button.dataset.project)),
    ),
  );
  $("#open-preview").addEventListener("click", () =>
    openProject(projects[controller.index]),
  );
}

let previouslyFocused = null;
function openProject(project) {
  const dialog = $("#project-dialog");
  previouslyFocused = document.activeElement;
  $("#dialog-image").src = asset(project.image);
  $("#dialog-image").alt = project.alt;
  // Videos are local official captures, loaded only after an explicit preview click.
  const video = document.createElement("video");
  video.id = "dialog-video";
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.preload = "none";
  video.poster = asset(project.image);
  video.setAttribute("aria-label", `${project.title} gameplay recording`);
  video.src = asset(project.image.replace(".webp", ".mp4"));
  video.addEventListener(
    "error",
    () => {
      video.hidden = true;
      $("#dialog-image").hidden = false;
      $("#dialog-description").textContent =
        "The video could not load. You can still explore this project on the official Quadcode AI site.";
    },
    { once: true },
  );
  $("#dialog-image").hidden = true;
  $("#dialog-image").before(video);
  video.play().catch(() => {
    /* Native controls remain available if autoplay is blocked. */
  });
  $("#dialog-title").textContent = project.title;
  $("#dialog-description").textContent = project.description;
  $("#dialog-link").href = project.url;
  dialog.showModal();
  dialog.scrollTop = 0;
  document.body.classList.add("modal-open");
  $(".dialog-close").focus({ preventScroll: true });
}
function initializeDialog() {
  const dialog = $("#project-dialog");
  // Animated close: play the reverse keyframes, then really close. A
  // second click during the 200ms is ignored rather than double-closing.
  const closeAnimated = () => {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dialog.classList.remove("is-closing");
      dialog.close();
    };
    dialog.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 260); // belt: never leave a modal stuck half-closed
  };
  $(".dialog-close").addEventListener("click", closeAnimated);
  dialog.addEventListener("cancel", (event) => {
    // Esc: route through the same exit animation.
    event.preventDefault();
    closeAnimated();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      closeAnimated();
  });
  dialog.addEventListener("close", () => {
    const video = $("#dialog-video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    $("#dialog-image").hidden = false;
    document.body.classList.remove("modal-open");
    previouslyFocused?.focus({ preventScroll: true });
  });
}
function initializeNavigation() {
  const toggle = $(".menu-toggle");
  const nav = $("#main-nav");
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  };
  toggle.addEventListener("click", () =>
    setOpen(toggle.getAttribute("aria-expanded") !== "true"),
  );
  $$("a", nav).forEach((link) =>
    link.addEventListener("click", () => setOpen(false)),
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      setOpen(false);
      toggle.focus();
    }
  });
  nav.addEventListener("focusout", () =>
    setTimeout(() => {
      if (
        !nav.contains(document.activeElement) &&
        document.activeElement !== toggle
      )
        setOpen(false);
    }, 0),
  );
  matchMedia("(min-width:901px)").addEventListener("change", () =>
    setOpen(false),
  );

  // Scroll-spy. The underline under a nav item is a claim about where you
  // are; a static class makes it lie from the second screen down. The
  // active section is the last one whose top has passed a line 35% down
  // the viewport — past the header, before the middle, so a short section
  // still gets its turn.
  const links = $$("a[href^='#']", nav);
  const targets = links
    .map((link) => ({ link, section: $(link.getAttribute("href")) }))
    .filter((entry) => entry.section);
  if (!targets.length) return;
  let current = null;
  const spy = () => {
    const line = innerHeight * 0.35;
    let active = targets[0];
    for (const entry of targets) {
      if (entry.section.getBoundingClientRect().top <= line) active = entry;
    }
    if (active === current) return;
    current = active;
    for (const { link } of targets) {
      const on = link === active.link;
      link.classList.toggle("nav-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  };
  addEventListener("scroll", spy, { passive: true });
  addEventListener("resize", spy);
  spy();
}

// ---- Scroll reveal: one observer for the whole page ------------------------
// Tags `h2`, `h2 + p` and anything with [data-reveal] inside every section
// and the footer as `.sr`, and the section root itself as `.section-fade`, so
// a block arrives as one unit instead of "heading fades, grid pops".
// Stagger is decided per reveal batch (60ms a step, four steps max), never by
// DOM position: a card three screens down should not inherit a delay it never
// earned. Reveal happens once; scrolling back up never re-hides content.
// The hero is skipped — it owns the game embed and nothing there should be
// at opacity 0 while a canvas is warming up.
function initializeReveal() {
  if (typeof IntersectionObserver === "undefined") return;
  const aboveFold = (el) =>
    scrollY === 0 && el.getBoundingClientRect().bottom < innerHeight * 0.5;

  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach((entry, index) => {
          const el = entry.target;
          el.style.setProperty("--sr-delay", `${Math.min(index, 4) * 60}ms`);
          el.classList.add(
            el.classList.contains("section-fade") ? "section-fade-in" : "sr-in",
          );
          observer.unobserve(el);
        });
    },
    // ~12% into the viewport from the bottom: early enough that the rise
    // finishes while the element is still low on screen, late enough to be seen.
    { rootMargin: "0px 0px -12% 0px", threshold: 0 },
  );

  // `body > footer`, not `footer`. A bare tag selector also matched every
  // NESTED footer on the page — `.rate__foot` inside the pricing section and
  // the one the prompt card renders — so those got `.section-fade` on top of
  // the `.sr` they had already earned as `[data-reveal]`, and two different
  // reveal transitions fought over the same element.
  $$("main > section, body > footer").forEach((section) => {
    if (section.classList.contains("hero")) return;
    if (!aboveFold(section)) {
      section.classList.add("section-fade");
      observer.observe(section);
    }
    $$("h2, h2 + p, [data-reveal]", section).forEach((el) => {
      if (el.classList.contains("sr") || aboveFold(el)) return;
      el.classList.add("sr");
      observer.observe(el);
    });
  });
}

// ---- Skeletons -------------------------------------------------------------
// Every content image sits in a shimmering placeholder until it has decoded.
// Containers are picked by selector, not "img.parentElement", because a
// wrapper that's already position:absolute (the game poster) must not be
// forced relative. Already-cached images resolve on the same tick, so a
// warm reload shows no shimmer at all.
function initializeSkeletons() {
  const containers = $$(
    ".hero-game__poster, .gallery-viewport, .gallery-thumb, .project-window, .app-tile, .tool-tile, .footer-brand, #project-dialog .dialog-media",
  );
  containers.forEach((box) => {
    const img = box.querySelector("img");
    if (!img) return;
    const done = () => {
      box.classList.remove("skel");
      box.classList.add("skel-done");
    };
    if (img.complete && img.naturalWidth) return; // cached: no flash
    box.classList.add("skel");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

// ---- FAQ accordion ---------------------------------------------------------
// <details> snaps open/closed. We keep it (free a11y, works without JS) but
// drive the height ourselves: measure, animate 0→h or h→0 on the answer,
// and only flip `open` after the close animation so the box doesn't vanish
// mid-collapse. Opening one closes the others — one question at a time.
function initializeFaq() {
  const items = $$(".faq-item");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  // Padding collapses with the height, otherwise a 21px band of nothing
  // stays visible at the "closed" end of the animation.
  const frame = (p, h, on) => {
    const cs = getComputedStyle(p);
    return {
      height: `${h}px`,
      paddingTop: on ? cs.paddingTop : "0px",
      paddingBottom: on ? cs.paddingBottom : "0px",
      opacity: on ? 1 : 0,
    };
  };
  const animate = (p, from, to) =>
    p.animate([frame(p, from, !!from), frame(p, to, !!to)], {
      duration: 280,
      easing: EASE,
    }).finished;

  const close = async (item) => {
    const p = item.querySelector("p");
    if (!reduced && p) {
      p.style.overflow = "hidden";
      await animate(p, p.offsetHeight, 0).catch(() => {});
      p.style.overflow = "";
    }
    item.open = false;
  };
  const open = async (item) => {
    const p = item.querySelector("p");
    item.open = true;
    if (reduced || !p) return;
    const h = p.offsetHeight;
    p.style.overflow = "hidden";
    await animate(p, 0, h).catch(() => {});
    p.style.overflow = "";
  };

  items.forEach((item) => {
    item.querySelector("summary").addEventListener("click", (event) => {
      event.preventDefault();
      if (item.open) close(item);
      else {
        items.filter((other) => other !== item && other.open).forEach(close);
        open(item);
      }
    });
  });
}

// ---- Feature clips ---------------------------------------------------------
// A muted loop that decodes while it is three screens away is a tax on every
// visitor's battery. The clip loads and plays only while it is on screen, and
// with `prefers-reduced-motion: reduce` it never plays at all — the poster is
// the same frame, so the slide still reads.
function initializeFeatureVideo() {
  const videos = $$("[data-feature-video]");
  if (!videos.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          if (target.preload !== "auto") target.preload = "auto";
          target.play().catch(() => {
            /* Autoplay refused: the poster stays, nothing breaks. */
          });
        } else if (!target.paused) {
          target.pause();
        }
      });
    },
    { threshold: 0.35 },
  );
  videos.forEach((video) => observer.observe(video));

  // A backgrounded tab keeps rAF-throttled video decoding alive in some
  // browsers; stop it explicitly and resume only if still in view.
  document.addEventListener("visibilitychange", () => {
    videos.forEach((video) => {
      if (document.hidden) video.pause();
      else if (video.getBoundingClientRect().top < innerHeight)
        video.play().catch(() => {});
    });
  });
}

// ---- Header: transparent, and it gets out of the way -----------------------
// No shelf, no fill. The nav's only state is presence: scroll down and it
// lifts off the top edge, scroll up and it comes back (CSS owns the motion —
// see `.site-header.is-hidden`).
// Direction is read from an accumulator, not from the sign of a single
// scroll event. A trackpad emits a 1px event in the wrong direction all the
// time, and a raw sign test makes the header strobe. Travel is summed while
// the direction holds and reset the moment it flips, so the header only
// moves once the reader has actually committed: 64px down to hide it (one
// header's worth — below that you are still reading the same line), 24px up
// to bring it back (going back is an intention, it should feel instant).
// Two overrides: the top of the page always shows it, and so does keyboard
// focus landing inside it — a Tab stop you cannot see is a broken page.
function initializeHeaderAutoHide() {
  const header = $(".site-header");
  const TOP_ZONE = 80;
  const COMMIT_DOWN = 64;
  const COMMIT_UP = 24;
  let last = Math.max(0, scrollY);
  let travel = 0;
  let hidden = false;
  let queued = false;

  const setHidden = (next) => {
    if (next === hidden) return;
    hidden = next;
    header.classList.toggle("is-hidden", next);
  };

  const update = () => {
    queued = false;
    const y = Math.max(0, scrollY);
    const step = y - last;
    last = y;
    if (y <= TOP_ZONE) {
      travel = 0;
      setHidden(false);
      return;
    }
    travel = (travel > 0) === (step > 0) ? travel + step : step;
    if (travel > COMMIT_DOWN) setHidden(true);
    else if (travel < -COMMIT_UP) setHidden(false);
  };

  addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  header.addEventListener("focusin", () => {
    travel = 0;
    setHidden(false);
  });
  update();
}

// Landing always opens at the top (ad traffic). Deep links (#pricing etc.)
// still jump to their section.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash) scrollTo(0, 0);

renderContent();
hydrateIcons();
initializeDialog();
initializeHero();
// Old static image gallery replaced by the video showreel (showreel.js).
initShowreel();
initWorldTyping();

// Topic 03: types a sentence onto the glass slab, holds, erases, next one.
// Runs only while the visual is on screen; reduced motion gets it static.
function initWorldTyping() {
  const el = document.querySelector("[data-world-type]");
  if (!el) return;
  const lines = [
    "A floating island with a castle, a waterfall and a dragon",
    "A harbor town at sunset with ships and lanterns",
    "A jungle temple hidden behind a giant waterfall",
  ];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = lines[0];
    return;
  }
  let li = 0, ci = 0, dir = 1, timer = 0, on = false;
  const tick = () => {
    const s = lines[li];
    ci += dir;
    el.textContent = s.slice(0, ci);
    let wait = dir > 0 ? 38 + Math.random() * 40 : 14;
    if (dir > 0 && ci >= s.length) { dir = -1; wait = 2600; }
    else if (dir < 0 && ci <= 0) { dir = 1; li = (li + 1) % lines.length; wait = 450; }
    timer = on ? setTimeout(tick, wait) : 0;
  };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !timer) timer = setTimeout(tick, 300);
    if (!on) { clearTimeout(timer); timer = 0; }
  }, { threshold: 0.3 }).observe(el.closest(".feature-visual") || el);
}
initializeNavigation();
initializeReveal();
initMotion();
initializeSkeletons();
initializeFaq();
initializeFeatureVideo();
initializeHeaderAutoHide();
initializeRateHover();
placeOffer();
initializeOffer();
initializeDeal();
initPaywallClock();
initPaywallToggle();
initTestimonials();
