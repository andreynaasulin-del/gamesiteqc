// The six-hour hold. Three things are worth a test here, and they are all
// things a human eye would take six hours to catch:
//   1. the window is six hours and the clock string never changes width,
//   2. a return visit inside the window keeps the SAME deadline (this is
//      the whole honesty argument — a timer that resets on reload has
//      admitted it is theatre),
//   3. the clock lives in the table's corner cell, not in a plan column,
//      and the markup it needs is actually in index.html.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HOLD_HOURS,
  HOLD_MS,
  SOON_MS,
  resolveDeadline,
  formatHold,
  describeHold,
} from "../src/landing/offer.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the hold is six hours, and the offer copy says so in hours nobody has to convert", () => {
  assert.equal(HOLD_HOURS, 6);
  assert.equal(HOLD_MS, 6 * 60 * 60 * 1000);
  assert.equal(formatHold(HOLD_MS), "06:00:00");
  // The urgent state is the last half hour of the six, not the whole of it.
  assert.ok(SOON_MS < HOLD_MS / 2);
});

test("the clock string is fixed width, so no digit ever shifts under the eye", () => {
  const samples = [HOLD_MS, HOLD_MS - 1, 3_600_000, 59_000, 999, 0, -5000];
  const widths = new Set(samples.map((ms) => formatHold(ms).length));
  assert.deepEqual([...widths], [8], "HH:MM:SS is always eight characters");
  assert.equal(formatHold(0), "00:00:00");
  assert.equal(formatHold(-5000), "00:00:00", "a lapsed window never shows a negative");
  assert.equal(formatHold(59_000), "00:00:59");
  assert.equal(formatHold(3_600_000), "01:00:00");
});

test("a reload inside the window shows the same deadline, not a fresh six hours", () => {
  const now = 1_700_000_000_000;
  const armed = resolveDeadline(0, now);
  assert.equal(armed, now + HOLD_MS, "first visit arms a full window");

  // Five minutes later, same visitor, page reloaded.
  const later = now + 5 * 60 * 1000;
  assert.equal(
    resolveDeadline(armed, later),
    armed,
    "the stored deadline is reused — this is the anti-reset guarantee",
  );
  assert.equal(formatHold(armed - later), "05:55:00");
});

test("a lapsed window re-arms instead of stranding a dead clock next to a live price", () => {
  const now = 1_700_000_000_000;
  const stale = now - 1000;
  assert.equal(resolveDeadline(stale, now), now + HOLD_MS);
  // Exactly-now counts as lapsed: > , not >=.
  assert.equal(resolveDeadline(now, now), now + HOLD_MS);
});

test("screen readers get whole minutes, never a per-second announcement", () => {
  assert.equal(describeHold(HOLD_MS), "6 hours");
  assert.equal(describeHold(3_600_000), "1 hour");
  assert.equal(describeHold(3_660_000), "1 hour 1 min");
  assert.equal(describeHold(90_000), "2 min");
  assert.equal(describeHold(-1), "0 min");
  // The visible clock ticks every second; the spoken one must not, so the
  // description has to be stable across a whole minute of values.
  const spoken = new Set();
  for (let s = 0; s < 30; s += 1) spoken.add(describeHold(HOLD_MS - s * 1000));
  assert.equal(spoken.size, 1, "thirty seconds of ticking is one announcement");
});

test("the clock is a row of the table, not a note in the corner, and starts hidden", () => {
  const corner = html.match(/<header class="rate__corner">[\s\S]*?<\/header>/);
  assert.ok(corner, "the corner cell is still the pricing heading");
  // v1 lived in here and was invisible: the corner is bottom-aligned, so the
  // clock sat ~200px below the prices in the dead band beside the buttons.
  assert.doesNotMatch(corner[0], /data-offer/, "the hold is out of the corner cell");

  // It is a direct child of the grid, between the corner and the plans, so
  // grid placement can drop it into the price stack on desktop while DOM
  // order puts it under the intro on a phone.
  assert.match(
    html,
    /<\/header>\s*(?:<!--[\s\S]*?-->\s*)*<div class="offer" data-offer hidden>/,
    "the strip is a grid item of .rate, right after the corner",
  );
  assert.match(html, /<div class="offer"[^>]*\bhidden\b/, "no clock until JS arms one");
  assert.match(html, /data-offer-clock/);
  assert.match(html, /data-offer-live[^>]*aria-live="polite"/);

  // Exactly one mount: a clock per discounted column would print one fact
  // twice, which is the defect this whole table was built against.
  // `data-offer` exactly — not the `data-offer-clock`/`-live` hooks inside it.
  assert.equal((html.match(/data-offer(?![-\w])/g) || []).length, 1);
});

test("the strip's column span is derived from the discount, never hardcoded", () => {
  const app = readFileSync(new URL("../src/landing/app.js", import.meta.url), "utf8");
  // The strip covers the struck-price columns. If that span were a literal,
  // re-ordering or re-pricing a tier would leave a countdown sitting over a
  // plan sold at list.
  assert.match(app, /planAnchor\(plan\) == null \? null : index \+ COL_OFFSET/);
  assert.match(app, /--offer-col/);
  assert.match(app, /--offer-span/);
  // And the head must have grown a row for it, or the strip would overlap
  // the buttons.
  assert.match(app, /const HEAD_ROWS = 7;/);
  const css = readFileSync(new URL("../src/landing/pricing.css", import.meta.url), "utf8");
  assert.match(css, /--head-rows: 7;/, "CSS must agree with HEAD_ROWS");
  assert.match(css, /\.rate__cta \{[^}]*grid-row: 7;/, "the button sits below the strip");
});

test("the hold never claims to be a per-plan price", () => {
  const offer = html.match(/<div class="offer"[\s\S]*?<\/div>/)[0];
  // It must name the two plans it applies to — otherwise a reader assumes
  // the entry tier is discounted too, and the $9 has no struck price.
  assert.match(offer, /Pro yearly/);
  // And it must not invent a deadline we cannot honour.
  assert.doesNotMatch(offer, /expire|ends in|last chance|hurry/i);
});
