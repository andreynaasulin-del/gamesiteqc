/**
 * motion.js — v4 "bold" motion layer. Styling lives in bold.css; this file
 * only tags elements and toggles classes/vars.
 *
 *   split   every section <h2> is split into words that rise out of a mask
 *   wipe    media blocks open from a clipped, slightly zoomed state
 *   spot    cards get a pointer spotlight + small 3D tilt (fine pointers)
 *   bar     brand scroll-progress bar at the top of the viewport
 *
 * Reduced motion: nothing is split or clipped, so content is never hidden.
 */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

const WIPE = ".feature-visual, .workspace-card, .step-art, .community-card, .visual-team";
// No tilt, and never on the rate card: a pricing table must sit still.
const SPOT = ".workspace-card, .step, .community-card, .feature-visual";

/** Wrap every word of `el` (recursing into inline children like .accent). */
function splitWords(el) {
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = child.textContent.split(/(\s+)/);
        if (!parts.some((p) => p.trim())) return;
        const frag = document.createDocumentFragment();
        parts.forEach((part) => {
          if (!part) return;
          if (!part.trim()) {
            frag.append(document.createTextNode(part));
            return;
          }
          const outer = document.createElement("span");
          outer.className = "split-word";
          const inner = document.createElement("span");
          inner.style.setProperty("--i", i++);
          inner.textContent = part;
          outer.append(inner);
          frag.append(outer);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && !child.matches("svg, img, video")) {
        walk(child);
      }
    });
  };
  // keep the heading readable as one phrase for screen readers
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  walk(el);
  el.classList.add("is-split");
}

function observeIn(nodes, threshold = 0.18) {
  if (!nodes.length || typeof IntersectionObserver === "undefined") {
    nodes.forEach((n) => n.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    },
    { threshold, rootMargin: "0px 0px -8% 0px" },
  );
  nodes.forEach((n) => io.observe(n));
}

function initSplit() {
  const heads = [...document.querySelectorAll("main section h2")].filter(
    (h) => !h.closest(".hero") && !h.classList.contains("is-split") && !h.hasAttribute("data-typeline"),
  );
  heads.forEach(splitWords);
  observeIn(heads, 0.3);
}

function initWipe() {
  const media = [...document.querySelectorAll(WIPE)].filter((m) => !m.closest(".hero"));
  media.forEach((m) => m.classList.add("wipe"));
  observeIn(media, 0.12);
}

function initSpot() {
  document.querySelectorAll(SPOT).forEach((card) => {
    card.classList.add("spot");
    let raf = 0;
    card.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", `${x * 100}%`);
        card.style.setProperty("--my", `${y * 100}%`);
      });
    });
    card.addEventListener("pointerleave", () => cancelAnimationFrame(raf));
  });
}

function initProgress() {
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty("--p", max > 0 ? (scrollY / max).toFixed(4) : 0);
  };
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

/**
 * Typed two-line headline. Types line A, then line B (accent), holds,
 * deletes back and moves to the next phrase. Runs only while the heading
 * is on screen and the tab is visible — no timers ticking off-screen.
 * Reduced motion: the first phrase stays as static text.
 */
const TYPE_PHRASES = [
  ["Learn from", "real projects."],
  ["Start from", "a finished game."],
  ["Borrow what", "already works."],
];

function initTypeline() {
  const h = document.querySelector("[data-typeline]");
  if (!h) return;
  const a = h.querySelector("[data-typeline-a]");
  const b = h.querySelector("[data-typeline-b]");
  const caret = h.querySelector(".typeline__caret");
  if (reduce) {
    caret?.remove();
    return;
  }
  let phrase = 0;
  let timer = 0;
  let visible = false;
  let step = null; // next action, resumed when the heading comes back
  const put = (el) => el.after(caret);
  const wait = (ms, fn) => {
    step = fn;
    clearTimeout(timer);
    if (visible && !document.hidden) timer = setTimeout(() => ((step = null), fn()), ms);
  };
  // Human rhythm: small jitter, a beat after spaces and punctuation.
  const typeDelay = (ch) => 38 + Math.random() * 42 + (ch === " " ? 40 : 0) + (/[.,]/.test(ch) ? 120 : 0);

  const type = (el, text, i, done) => {
    put(el);
    h.classList.add("is-typing");
    if (i > text.length) return done();
    el.textContent = text.slice(0, i);
    wait(typeDelay(text[i - 1] || ""), () => type(el, text, i + 1, done));
  };
  const erase = (el, done) => {
    put(el);
    const t = el.textContent;
    if (!t.length) return done();
    el.textContent = t.slice(0, -1);
    wait(18 + Math.random() * 14, () => erase(el, done));
  };
  const cycle = () => {
    const [la, lb] = TYPE_PHRASES[phrase];
    type(a, la, a.textContent.length + 1, () =>
      wait(90, () =>
        type(b, lb, b.textContent.length + 1, () => {
          h.classList.remove("is-typing"); // caret blinks while holding
          wait(2800, () => {
            h.classList.add("is-typing");
            erase(b, () =>
              erase(a, () => {
                phrase = (phrase + 1) % TYPE_PHRASES.length;
                wait(380, cycle);
              }),
            );
          });
        }),
      ),
    );
  };

  // First phrase is already rendered: start from the hold, then erase.
  put(b);
  const first = () =>
    wait(2400, () => {
      h.classList.add("is-typing");
      erase(b, () => erase(a, () => ((phrase = 1), wait(380, cycle))));
    });
  step = first;

  const resume = () => {
    if (!visible || document.hidden || !step) return;
    const fn = step;
    wait(300, fn);
  };
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) resume();
      else clearTimeout(timer);
    },
    { threshold: 0.4 },
  ).observe(h);
  document.addEventListener("visibilitychange", () =>
    document.hidden ? clearTimeout(timer) : resume(),
  );
}

export function initMotion() {
  initProgress();
  initTypeline();
  if (finePointer && !reduce) initSpot();
  if (reduce) return;
  initSplit();
  initWipe();
}
