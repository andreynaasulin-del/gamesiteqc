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
    (h) => !h.closest(".hero") && !h.classList.contains("is-split"),
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

export function initMotion() {
  initProgress();
  if (finePointer && !reduce) initSpot();
  if (reduce) return;
  initSplit();
  initWipe();
}
