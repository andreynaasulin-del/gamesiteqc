// ---------------------------------------------------------------------------
// THE HOLD — a six-hour window on the Pro discount.
//
// WHERE IT LIVES AND WHY. The buyer's path on this product is: land, watch
// the games, read the table, leave to download a desktop app, sign in,
// think about it, and only then pay — on quadcode.ai/profile/plans, which is
// not this page. So a countdown has exactly one job here, and it is NOT
// "buy in the next six hours": nobody can buy on this page at all. Its job
// is to put a clock on the two struck prices ($58 → $29, $360 → $180) at the
// moment the reader is deciding whether to act now or "come back later",
// because "come back later" is where this funnel loses people — not at the
// price.
//
// WHERE IT SITS, AND THE ONE THAT DID NOT WORK. The first version put the
// clock in the table's corner cell, under the sentence that makes the claim
// ("Pro is half its regular rate right now") — claim and proof in one
// place, and it touched none of the head rows. The argument was right and
// the result was invisible: the corner is `align-self: end`, so the clock
// landed in the empty band to the LEFT of the buttons, a couple of hundred
// pixels below the prices, where no one reading a price column ever looks.
//
// It is now a ROW OF THE TABLE — `.offer` is a child of `.rate`, head row 6
// of 7 — spanning exactly the columns whose price is struck, so it sits
// directly under $29 and $180 and directly above their two buttons. Two
// consequences worth knowing before moving it again:
//   - The span is what NAMES the plans. There is no "applies to Pro" note,
//     because the strip simply is not over the column it does not cover.
//     app.js writes --offer-col/--offer-span from plans.js, so re-pricing a
//     tier moves the strip instead of making the note a lie. Below 900px
//     the columns become stacked cards and the geometry stops saying it, so
//     the phone stylesheet un-hides `.offer__scope` to say it in words.
//   - A row, not an overlay. Column alignment is untouched — the row just
//     gets taller for all three columns — but its height comes straight off
//     the section's one-screen fit, which had zero slack. See the clamps on
//     `.offer` in pricing.css.
//
// HONESTY, AND THE ONE THING THAT GIVES FAKE TIMERS AWAY. The window is
// per-visitor, and the deadline is PERSISTED. A countdown that restarts at
// 6:00:00 on every reload is the tell everyone knows — reload once and the
// page has admitted it is theatre. Here a reload, a new tab or a return an
// hour later all show the same deadline, because the deadline is a stored
// timestamp, not a counter. It is also armed when the pricing section is
// first SEEN, not at page load: arming on load means a reader who watched a
// dragon demo for four minutes arrives at a clock that has already run
// down, which reads as a trick rather than an offer.
//
// What this module does NOT do: claim the price changes when the clock hits
// zero. It says "held for", and when the window lapses it re-arms a fresh
// one silently. That is the most a front end can honestly promise while the
// discount is an open-ended launch offer with no real end date in the
// system. If the offer ever gets a real deadline, pass it in as `until` and
// delete the re-arm — see `resolveDeadline`.
// ---------------------------------------------------------------------------

export const HOLD_HOURS = 6;
export const HOLD_MS = HOLD_HOURS * 60 * 60 * 1000;
/** Under this, the clock turns accent: the last half hour is the only part
 *  of a six-hour window that is actually urgent. */
export const SOON_MS = 30 * 60 * 1000;
const STORE_KEY = "qc.offer.hold";

/** Private/incognito modes throw on localStorage access. A missing store is
 *  not a reason to lose the feature — the window just lives for one page. */
const readStore = () => {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeStore = (value) => {
  try {
    localStorage.setItem(STORE_KEY, String(value));
  } catch {
    /* no store, no persistence, still a working clock */
  }
};

/**
 * The deadline for this visitor: the stored one while it is still in the
 * future, otherwise a fresh window starting now.
 *
 * Exported and pure so the maths is testable without a DOM: given a stored
 * timestamp and a clock, there is exactly one right answer.
 */
export function resolveDeadline(stored, now) {
  return stored > now ? stored : now + HOLD_MS;
}

/** ms -> "HH:MM:SS", zero-padded and clamped at zero. Hours are padded to
 *  two digits so the string never changes width — an unpadded "6:00:00"
 *  becoming "5:59:59" would shift every digit beside it once an hour. */
export function formatHold(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

/** What a screen reader gets. A per-second announcement of a six-hour
 *  countdown is a denial-of-service on a screen reader, so the live region
 *  is coarse — whole minutes, and only while they change. */
export function describeHold(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
    return rest ? `${hourPart} ${rest} min` : hourPart;
  }
  return `${minutes} min`;
}

/**
 * Mount the clock. No-ops without the markup, so the module can ship ahead
 * of the section it belongs to, and the block stays `hidden` if anything
 * here throws — a broken timer is strictly worse than no timer.
 */
export function initializeOffer(root = document) {
  const box = root.querySelector("[data-offer]");
  if (!box) return;
  const clock = box.querySelector("[data-offer-clock]");
  const live = box.querySelector("[data-offer-live]");
  if (!clock) return;

  let deadline = 0;
  let timer = 0;
  let lastSpoken = "";

  const paint = () => {
    const left = deadline - Date.now();
    // A lapsed window re-arms rather than showing 00:00:00 next to a price
    // that has not changed. Zero on the clock with the discount still on
    // the page is the one state that calls the page a liar out loud.
    if (left <= 0) {
      deadline = Date.now() + HOLD_MS;
      writeStore(deadline);
      return paint();
    }
    clock.textContent = formatHold(left);
    box.classList.toggle("offer--soon", left <= SOON_MS);
    if (live) {
      const spoken = describeHold(left);
      if (spoken !== lastSpoken) {
        lastSpoken = spoken;
        live.textContent = `Half price held for ${spoken}.`;
      }
    }
    return left;
  };

  // Tick on the second BOUNDARY, not every 1000ms. A plain interval drifts
  // and, worse, a backgrounded tab throttles it — come back to the tab and
  // the clock is minutes behind the truth. Re-deriving from the deadline on
  // every frame means the displayed time is always correct no matter how
  // long the browser stopped calling us.
  const schedule = () => {
    clearTimeout(timer);
    paint();
    timer = setTimeout(schedule, 1000 - (Date.now() % 1000) + 10);
  };

  const start = () => {
    if (deadline) return;
    deadline = resolveDeadline(readStore(), Date.now());
    writeStore(deadline);
    box.hidden = false;
    schedule();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else if (deadline) schedule();
  });

  // Armed on first sight of the table, not at page load — see the header.
  const section = box.closest("section") || box;
  if (typeof IntersectionObserver === "undefined") {
    start();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { threshold: 0, rootMargin: "0px 0px -15% 0px" },
  );
  observer.observe(section);
}
