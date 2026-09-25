// ---------------------------------------------------------------------------
// PAYWALL — 1:1 copy of the higgsfield.ai/games-intro "Pick your plan" block
// (measured live): 4 cards STARTER / PLUS / ULTRA (Most popular, credit
// picker) / TEAM (Best value, seat stepper), Monthly⇄Annual switch, skewed
// OFF badges, blue model tag, credit box, struck/now price, Get Plan block,
// 7-DAY UNLIMITED box, feature list, 365-DAY box, disclaimer lines.
// Structure and styling are theirs; every number is ours (TIERS below) and
// every model name is read from MODEL_CATALOG in plans.js — no hand-typed
// names, so a model dropped from the plans cannot linger here.
// Plus = our real Pro ($29/mo, $180/yr, 5,000 credits).
// ---------------------------------------------------------------------------
import { icon } from "./icons.js";
import { DEAL_MS, formatDeal } from "./deal.js";
import { PLANS_URL, MODEL_CATALOG } from "./plans.js";

export const DEAL_PERCENT = 40;
const DEAL_KEY = "qc.deal.until";

// Model names and per-generation prices come from MODEL_CATALOG (plans.js),
// the one list of models that are really in our plans — never typed here.
// Drives the "= N / ~ N" lines in every credit box.
const MODEL = Object.fromEntries(MODEL_CATALOG.map((m) => [m.id, m]));
const COST = {
  image: { name: MODEL["gpt-image"].name, qcc: MODEL["gpt-image"].cost },
  video: { name: MODEL.seedance.name, qcc: MODEL.seedance.cost },
};
const N = (id) => MODEL[id].name;

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const fmt = (n) => Number(n).toLocaleString("en-US");

// chip: "no" = NO UNLIMITED (dim), "unl" = UNLIMITED (brand), "free:N" = N FREE GENS (white)
const TIERS = [
  {
    id: "starter",
    name: "Starter",
    tone: "base",
    tag: N("seedance"),
    pitch: "For first-time creators trying AI game building",
    options: [{ credits: 1000, monthly: 9, annual: 9 }],
    // Mirrors MONTHLY_MODELS: Seedance/Kling capped at 720p, Veo 3 & Omni locked.
    unlimited: [
      { name: N("veo-3"), hot: true, note: "From Plus" },
      { name: N("gpt-image"), chip: "no" },
      { name: N("seedance"), res: "720p", chip: "no" },
      { name: N("gemini-omni"), note: "From Plus" },
    ],
    features: [
      ["All agents: code, art, 3D & sound", true],
      ["Claude Code · Codex CLI", true],
      ["Commercial use", true],
      ["Priority generation queue", false],
      ["Early access to new models", false],
    ],
  },
  {
    id: "plus",
    name: "Plus",
    tone: "brand",
    tag: N("seedance"),
    pitch: "For creators shipping their first real games",
    options: [{ credits: 5000, monthly: 29, annual: 15 }],
    unlimited: [
      { name: N("veo-3"), hot: true, chip: "free:3" },
      { name: N("gpt-image"), res: "2K", chip: "unl" },
      { name: N("seedance"), res: "1080p", chip: "no" },
      { name: N("gemini-omni"), chip: "no" },
    ],
    features: [
      ["All agents: code, art, 3D & sound", true],
      ["Claude Code · Codex CLI", true],
      ["Commercial use", true],
      ["Priority generation queue", true],
      ["Early access to new models", false],
    ],
    yearly: [
      { name: N("gpt-image"), chip: "unl365" },
      { name: N("seedance"), chip: "free:100" },
    ],
  },
  {
    id: "ultra",
    name: "Ultra",
    tone: "pink",
    badge: "Best value",
    tag: N("veo-3"),
    pitch: "For heavy creators building every day",
    options: [
      { credits: 10000, monthly: 49, annual: 35 },
      { credits: 20000, monthly: 89, annual: 64 },
      { credits: 30000, monthly: 129, annual: 93 },
    ],
    unlimited: [
      { name: N("veo-3"), hot: true, chip: "free:10" },
      { name: N("gpt-image"), res: "4K", chip: "unl" },
      { name: N("seedance"), res: "1080p", chip: "unl" },
      { name: N("gemini-omni"), chip: "free:5" },
    ],
    features: [
      ["All agents: code, art, 3D & sound", true],
      ["Claude Code · Codex CLI", true],
      ["Commercial use", true],
      ["Priority generation queue", true],
      ["Early access to new models", true, "New"],
    ],
    yearly: [
      { name: N("gpt-image"), chip: "unl365" },
      { name: N("seedance"), chip: "unl365" },
      { name: N("veo-3"), chip: "free:300" },
    ],
  },
];

// Per-card live state: selected credit option, seats.
const state = Object.fromEntries(TIERS.map((t) => [t.id, { opt: 0, seats: t.seats?.start || 1 }]));
let period = "annual";

const offPct = (o) => Math.round((1 - o.annual / o.monthly) * 100);
const maxOff = () => Math.max(...TIERS.flatMap((t) => t.options.map(offPct)));

function chipMarkup(chip) {
  if (!chip) return "";
  if (chip === "no") return `<span class="pw-chip pw-chip--no">No unlimited</span>`;
  if (chip === "unl") return `<span class="pw-chip pw-chip--unl">Unlimited</span>`;
  if (chip === "unl365") return `<span class="pw-chip pw-chip--unl">365 unlimited</span>`;
  const n = chip.split(":")[1];
  return `<span class="pw-chip pw-chip--free">${esc(n)} free gens</span>`;
}

function unlimitedRow(row) {
  const right = row.note
    ? `<span class="pw-row__note">${esc(row.note)}</span>`
    : `${row.res ? `<span class="pw-chip pw-chip--res">${esc(row.res)}</span>` : ""}${chipMarkup(row.chip)}`;
  return `<li class="pw-row${row.hot ? " is-hot" : ""}"><span class="pw-row__name">${row.hot ? icon("sparkles", "i") : ""}${esc(row.name)}</span><span class="pw-row__right">${right}</span></li>`;
}

function creditBox(t) {
  const picker =
    t.options.length > 1
      ? `<div class="pw-slider">
          <div class="pw-slide" data-pw-slide role="slider" tabindex="0" aria-label="Credits per month"
            aria-valuemin="0" aria-valuemax="${t.options.length - 1}" aria-valuenow="0" aria-valuetext="${fmt(t.options[0].credits)} credits">
            <span class="pw-slide__rail"></span><span class="pw-slide__fill" data-pw-fill></span>
            <span class="pw-slide__thumb" data-pw-thumb>${icon("chevrons-lr", "i")}</span>
          </div>
          <div class="pw-slide__marks">${t.options
            .map(
              (o, i) =>
                `<button type="button" class="pw-slide__mark${i === 0 ? " is-on" : ""}" data-pw-opt="${i}" tabindex="-1">${fmt(o.credits)}</button>`,
            )
            .join("")}</div>
        </div>`
      : t.perSeat
        ? `<div class="pw-seats"><span class="pw-seats__label"><b data-pw-seats>${t.seats.start} seats</b></span><span class="pw-seats__ctl"><button type="button" data-pw-seat="-1" aria-label="Remove seat">${icon("minus", "i")}</button><button type="button" data-pw-seat="1" aria-label="Add seat">${icon("plus", "i")}</button></span></div>`
        : `<div class="pw-credits__fixed">${icon("check", "i")}<span>Fixed amount of <span data-pw-credits-fixed></span> credits/mo</span></div>`;
  return `<div class="pw-credits">
    <p class="pw-credits__main">${icon("sparkles", "i pw-credits__i")}<b data-pw-credits></b>credits${t.perSeat ? "/seat" : ""}/mo.</p>
    <p class="pw-credits__sub">= <b data-pw-images></b> ${COST.image.name} images</p>
    <p class="pw-credits__sub">~ <b data-pw-videos></b> ${COST.video.name} videos</p>
    ${picker}
  </div>`;
}

function cardMarkup(t) {
  const body = t.groups
    ? t.groups
        .map(
          ([title, items]) =>
            `<div class="pw-group"><span class="pw-group__title">${esc(title)}</span><ul class="pw-features">${items
              .map((f) => `<li>${icon("check", "i")}<span>${esc(f)}</span></li>`)
              .join("")}</ul></div>`,
        )
        .join("")
    : `<div class="pw-box">
        <div class="pw-box__head"><span>7-day unlimited</span><a href="${PLANS_URL}">Learn more</a></div>
        <ul>${t.unlimited.map(unlimitedRow).join("")}</ul>
      </div>
      <ul class="pw-features">${t.features
        .map(
          ([f, on, chip]) =>
            `<li class="${on ? "" : "is-off"}">${icon(on ? "check" : "x", "i")}<span>${esc(f)}</span>${chip ? `<span class="pw-new">${esc(chip)}</span>` : ""}</li>`,
        )
        .join("")}</ul>
      ${
        t.yearly
          ? `<div class="pw-box pw-box--year"><div class="pw-box__head"><span>365-day unlimited &amp; free gens</span></div><ul>${t.yearly
              .map(unlimitedRow)
              .join("")}</ul></div>`
          : ""
      }`;
  return `<div class="pw-wrap pw-wrap--${t.tone}${t.badge ? " is-featured" : ""}" data-pw-tier="${t.id}">
    <article class="pw-card pw-card--${t.tone}">
      <div class="pw-card__top">
        <div class="pw-card__title"><h3>${esc(t.name)}</h3><span class="pw-badge" data-pw-off hidden></span>${t.badge ? `<span class="pw-badge pw-badge--value">${esc(t.badge)}</span>` : ""}</div>
        <p class="pw-card__pitch">${esc(t.pitch)}</p>
        ${creditBox(t)}
        <div class="pw-price"><span class="pw-price__nums"><s class="pw-price__was" data-pw-was hidden></s><span class="pw-price__now" data-pw-now></span></span><span class="pw-price__per" data-pw-per></span></div>
      </div>
      <div class="pw-card__bottom">
        <div class="pw-cta">
          <a class="pw-btn pw-btn--${t.tone}" href="${PLANS_URL}">Get ${esc(t.name)}</a>
          <p class="pw-cta__save" data-pw-save></p>
        </div>
        ${body}
      </div>
    </article>
  </div>`;
}

function toggleMarkup() {
  return `<div class="pw-toggle">
    <span class="pw-toggle__lbl" data-pw-lbl="monthly">Monthly</span>
    <button type="button" class="pw-switch" role="switch" aria-checked="true" aria-label="Annual billing" data-pw-switch><span></span></button>
    <span class="pw-toggle__lbl" data-pw-lbl="annual">Annual</span>
    <span class="pw-badge">${maxOff()}% OFF</span>
  </div>`;
}

export function paywallMarkup() {
  return `<div class="pw-panel">${toggleMarkup()}<div class="pw-grid">${TIERS.map(cardMarkup).join("")}</div>
    <div class="pw-disc">
      <p>Unlimited and free generations are promotional: they apply to the listed models for the stated period and may change.</p>
      <p>Credits renew every billing period and do not roll over. Annual plans are billed once for 12 months.</p>
      <p>Prices in USD, before tax. Cancel any time from your profile.</p>
    </div>
  </div>`;
}

function renderCard(root, t) {
  const el = root.querySelector(`[data-pw-tier="${t.id}"]`);
  if (!el) return;
  const s = state[t.id];
  const o = t.options[s.opt];
  const seats = t.perSeat ? s.seats : 1;
  const annual = period === "annual";
  const now = annual ? o.annual : o.monthly;
  const off = offPct(o);
  const total = o.credits * seats;
  const set = (sel, text) => el.querySelectorAll(sel).forEach((n) => (n.textContent = text));

  set("[data-pw-credits]", fmt(o.credits));
  set("[data-pw-credits-fixed]", fmt(o.credits));
  set("[data-pw-images]", fmt(Math.floor(total / COST.image.qcc)));
  set("[data-pw-videos]", fmt(Math.floor(total / COST.video.qcc)));
  set("[data-pw-seats]", `${seats} seats`);

  const badge = el.querySelector("[data-pw-off]");
  badge.hidden = !(annual && off > 0);
  badge.textContent = `${off}% OFF`;

  const was = el.querySelector("[data-pw-was]");
  was.hidden = !(annual && o.annual < o.monthly);
  was.textContent = `$${o.monthly}`;
  set("[data-pw-now]", `$${now}`);
  set(
    "[data-pw-per]",
    `per ${t.perSeat ? "seat / " : ""}month${annual ? ", billed annually" : ""}`,
  );

  const save = (o.monthly - o.annual) * 12 * seats;
  el.querySelector("[data-pw-save]").innerHTML = annual
    ? save > 0
      ? `Save <b>$${fmt(save)}</b> compared to monthly`
      : "No difference compared to monthly"
    : save > 0
      ? `Switch to annual and save <b>$${fmt(save)}</b>`
      : "No difference compared to annual";

  el.querySelectorAll("[data-pw-opt]").forEach((b) => {
    b.classList.toggle("is-on", Number(b.dataset.pwOpt) === s.opt);
  });

  const slide = el.querySelector("[data-pw-slide]");
  if (slide) {
    const pct = t.options.length > 1 ? (s.opt / (t.options.length - 1)) * 100 : 0;
    el.querySelector("[data-pw-fill]").style.width = `${pct}%`;
    el.querySelector("[data-pw-thumb]").style.left = `${pct}%`;
    slide.setAttribute("aria-valuenow", String(s.opt));
    slide.setAttribute("aria-valuetext", `${fmt(o.credits)} credits`);
  }
}

// Ultra credit slider: drag / click anywhere on the track snaps to the
// nearest stop (HF behaviour); arrows / Home / End from the keyboard.
function initSliders(root) {
  root.querySelectorAll("[data-pw-slide]").forEach((slide) => {
    const id = slide.closest("[data-pw-tier]").dataset.pwTier;
    const t = TIERS.find((x) => x.id === id);
    const last = t.options.length - 1;
    const set = (opt) => {
      const next = Math.max(0, Math.min(last, opt));
      if (next === state[id].opt) return;
      state[id].opt = next;
      renderCard(root, t);
    };
    const fromX = (x) => {
      const r = slide.getBoundingClientRect();
      return Math.round(((x - r.left) / r.width) * last);
    };
    let dragging = false;
    const move = (e) => dragging && set(fromX(e.clientX));
    const end = () => {
      dragging = false;
      slide.classList.remove("is-drag");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    slide.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // no text selection while dragging; no focus ring on mouse
      dragging = true;
      slide.classList.add("is-drag");
      set(fromX(e.clientX));
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    });
    slide.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (step) set(state[id].opt + step);
      else if (e.key === "Home") set(0);
      else if (e.key === "End") set(last);
      else return;
      e.preventDefault();
    });
  });
}

function renderAll(root) {
  const sw = root.querySelector("[data-pw-switch]");
  if (sw) sw.setAttribute("aria-checked", String(period === "annual"));
  root.querySelectorAll("[data-pw-lbl]").forEach((l) => l.classList.toggle("is-on", l.dataset.pwLbl === period));
  TIERS.forEach((t) => renderCard(root, t));
}

/** Monthly⇄Annual switch, Ultra credit picker, Team seat stepper. */
export function initPaywallToggle(root = document) {
  const host = root.querySelector(".pw-panel");
  if (!host) return;
  host.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-pw-switch]");
    const lbl = e.target.closest("[data-pw-lbl]");
    const opt = e.target.closest("[data-pw-opt]");
    const seat = e.target.closest("[data-pw-seat]");
    const tier = e.target.closest("[data-pw-tier]");
    if (sw) period = period === "annual" ? "monthly" : "annual";
    else if (lbl) period = lbl.dataset.pwLbl;
    else if (opt && tier) state[tier.dataset.pwTier].opt = Number(opt.dataset.pwOpt);
    else if (seat && tier) {
      const t = TIERS.find((x) => x.id === tier.dataset.pwTier);
      const s = state[t.id];
      s.seats = Math.min(t.seats.max, Math.max(t.seats.min, s.seats + Number(seat.dataset.pwSeat)));
    } else return;
    renderAll(root);
  });
  initSliders(root);
  renderAll(root);
}

/** Keeps the footer deal clock in step with the header deal (same key). */
export function initPaywallClock(root = document) {
  const clocks = root.querySelectorAll("[data-pw-clock]");
  if (!clocks.length) return;
  const read = () => {
    try {
      return Number(localStorage.getItem(DEAL_KEY)) || 0;
    } catch {
      return 0;
    }
  };
  let local = Date.now() + DEAL_MS;
  const tick = () => {
    const stored = read();
    const deadline = stored > Date.now() ? stored : local;
    if (deadline <= Date.now()) local = Date.now() + DEAL_MS;
    const text = formatDeal(deadline - Date.now());
    clocks.forEach((el) => (el.textContent = text));
    setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
  };
  tick();
}
