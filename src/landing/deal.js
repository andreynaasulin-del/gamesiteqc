// ---------------------------------------------------------------------------
// HEADER DEAL — top-right dropdown with a 10-minute, 40%-off window.
//
// Same honesty rule as offer.js: the deadline is a STORED timestamp, so a
// reload does not restart the clock at 10:00. When the window lapses it
// re-arms silently instead of showing 00:00 next to a live discount.
// The CTA goes to the real payment page (PLANS_URL).
// ---------------------------------------------------------------------------
import { PLANS_URL } from "./plans.js";

export const DEAL_MS = 10 * 60 * 1000;
const STORE_KEY = "qc.deal.until";

const read = () => {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
};
const write = (value) => {
  try {
    localStorage.setItem(STORE_KEY, String(value));
  } catch {
    /* private mode: clock lives for this page only */
  }
};

/** ms -> "MM:SS", clamped at zero, fixed width. */
export function formatDeal(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function initializeDeal(root = document) {
  const box = root.querySelector("[data-deal]");
  if (!box) return;
  const toggle = box.querySelector("[data-deal-toggle]");
  const panel = box.querySelector("[data-deal-panel]");
  const clocks = box.querySelectorAll("[data-deal-clock]");
  const bar = box.querySelector("[data-deal-bar]");
  const cta = box.querySelector("[data-deal-cta]");
  if (!toggle || !panel) return;
  if (cta) cta.href = PLANS_URL;

  let deadline = read() > Date.now() ? read() : Date.now() + DEAL_MS;
  write(deadline);
  let timer = 0;

  const paint = () => {
    let left = deadline - Date.now();
    if (left <= 0) {
      deadline = Date.now() + DEAL_MS;
      write(deadline);
      left = DEAL_MS;
    }
    const text = formatDeal(left);
    clocks.forEach((el) => (el.textContent = text));
    if (bar) bar.style.transform = `scaleX(${left / DEAL_MS})`;
  };
  const tick = () => {
    clearTimeout(timer);
    paint();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
  };

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    box.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener("click", (event) => {
    if (!box.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else tick();
  });

  box.hidden = false;
  tick();
}
