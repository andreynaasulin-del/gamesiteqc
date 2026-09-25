// Per-block background tint (v7, "hidden" fade). One fixed stage, one layer
// per palette. No timed crossfade and no switching: every layer's opacity is
// a continuous function of how close its block's centre is to the viewport
// centre, recomputed on scroll. The colour simply follows the scroll, so
// there is never a moment where the background visibly "changes".
// Styles: src/landing/atmosphere.css (.bg-stage / .bg-scene--<name>).

const MAP = [
  ["#games", "sunset"],
  ["#capabilities .feature@0", "meadow"],
  ["#capabilities .feature@1", "lagoon"],
  ["#capabilities .feature@2", "ember"],
  ["#workspace", "sky"],
  ["#explore", "night"],
  [".worlds", "forest"],
  ["#workflow", "alpine"],
  [".cta-section", "coral"],
  ["#pricing", "dusk"],
  ["#faq", "ocean"],
];

// Max opacity of a fully-centred scene. Low on purpose: the tint must stay
// behind the content, never compete with it.
// v8: scene alphas are tuned for this peak (colour sits at the screen
// edges, so it can be richer without touching the content).
const PEAK = 0.9;

function init() {
  const names = [...new Set(MAP.map(([, n]) => n))];
  const stage = document.createElement("div");
  stage.className = "bg-stage";
  stage.setAttribute("aria-hidden", "true");
  const layers = {};
  for (const n of names) {
    const l = document.createElement("div");
    l.className = `bg-scene bg-scene--${n}`;
    stage.appendChild(l);
    layers[n] = l;
  }
  document.body.prepend(stage);

  // Blocks are partly rendered by app.js after load — resolve lazily.
  let targets = [];
  const resolve = () => {
    if (targets.length === MAP.length) return;
    targets = [];
    for (const [sel, n] of MAP) {
      const [css, idx] = sel.split("@");
      const el = document.querySelectorAll(css)[Number(idx) || 0];
      if (el) targets.push([el, n]);
    }
  };

  let raf = 0;
  const update = () => {
    raf = 0;
    resolve();
    const vh = innerHeight;
    const mid = vh / 2;
    const w = {};
    let sum = 0;
    for (const [el, n] of targets) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      // distance from viewport centre to the nearest point of the block,
      // so a tall block holds its tint while you scroll through it
      const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
      const k = Math.max(0, 1 - d / (vh * 0.6));
      const s = k * k * (3 - 2 * k); // smoothstep
      if (s > (w[n] || 0)) w[n] = s;
    }
    for (const n of names) sum += w[n] || 0;
    for (const n of names) {
      const o = sum ? ((w[n] || 0) / sum) * PEAK : 0;
      layers[n].style.opacity = o.toFixed(3);
    }
  };
  const req = () => (raf ||= requestAnimationFrame(update));
  addEventListener("scroll", req, { passive: true });
  addEventListener("resize", req);
  addEventListener("load", req);
  update();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
