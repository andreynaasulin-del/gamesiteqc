import { test } from "node:test";
import assert from "node:assert/strict";
import { icon, hydrateIcons } from "../src/landing/icons.js";

const NAMES = [
  "arrow-up-right",
  "arrow-right",
  "arrow-left",
  "arrow-up",
  "play",
  "x",
  "download",
  "sparkles",
  "log-out",
  "gamepad",
  "expand",
];

test("every icon renders a decorative inline SVG on the 24-unit grid", () => {
  for (const name of NAMES) {
    const html = icon(name);
    assert.match(html, /^<i class="i" aria-hidden="true"><svg viewBox="0 0 24 24"/, name);
    assert.match(html, /stroke="currentColor"/, name);
    assert.match(html, /<\/svg><\/i>$/, name);
    // Icons are sized via CSS from the parent — no baked width/height.
    assert.doesNotMatch(html, /\swidth=|\sheight=/, name);
  }
});

test("unknown icon names fail loudly instead of rendering an empty box", () => {
  assert.throws(() => icon("nope"), /Unknown icon "nope"/);
});

test("hydrateIcons fills [data-icon] elements and marks them decorative", () => {
  const made = [];
  const fakeEl = (name) => {
    const el = {
      dataset: { icon: name },
      attrs: {},
      classes: new Set(),
      innerHTML: "",
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      classList: {
        add: (c) => el.classes.add(c),
      },
    };
    made.push(el);
    return el;
  };
  const root = {
    querySelectorAll: () => [fakeEl("play"), fakeEl("unknown")],
  };
  hydrateIcons(root);
  assert.equal(made[0].attrs["aria-hidden"], "true");
  assert.ok(made[0].classes.has("i"));
  assert.match(made[0].innerHTML, /<svg viewBox="0 0 24 24"/);
  // Unknown names are skipped, not exploded — a typo in markup must not
  // take the whole boot sequence down.
  assert.equal(made[1].innerHTML, "");
});
