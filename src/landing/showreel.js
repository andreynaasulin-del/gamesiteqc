// Explore showreel (full-bleed video stage + tile rail) and the "Worlds"
// masonry carousel. Perf rules: only ONE stage video decodes at a time,
// gallery cards play only while on screen, everything is muted/inline,
// sources are the compressed copies in landing/web/ (never the originals).

const v = (id) => `landing/web/${id}.mp4`;

export const reel = [
  { id: "railrun-v2", title: "Railrun", genre: "FPS · Train heist", line: "Sprint the roof of a speeding train and hold the line." },
  { id: "shroud-v2", title: "Shroud", genre: "Stealth · Action", line: "Rooftops, shadows, one bolt left. Nobody sees you coming." },
  { id: "emberveil-v2", title: "Emberveil", genre: "Fantasy · Action RPG", line: "Roll through the fire and burn the horde back." },
  { id: "abyss-v3", title: "Abyss", genre: "Survival horror · Deep sea", line: "Your lights are all you have down here." },
  { id: "rally", title: "Dirtline", genre: "Racing · Off-road rally", line: "Mud, dust and a sunset you take flat out." },
  { id: "verdant-v2", title: "Verdant", genre: "Dark fantasy · Action", line: "A cursed forest and a blade that does not rest." },
  { id: "tidewalker-v2", title: "Tidewalker", genre: "Underwater · Exploration", line: "Lift the wreck, open the gate, dive deeper." },
];

// Column layout for the masonry rail: `w` is the column width in row units,
// each card takes `rows` (1 or 2) of the two-row track.
export const worlds = [
  { w: 1.78, cards: [{ id: "ring-planet-v3", title: "Ringfall", genre: "Space combat", rows: 1 }, { id: "amberfall", title: "Amberfall", genre: "Adventure", rows: 1 }] },
  { w: 1.18, cards: [{ id: "sky-isles", title: "Sky Isles", genre: "Dragon flight", rows: 2 }] },
  { w: 1.66, cards: [{ id: "orbit-dock", title: "Orbit Dock", genre: "Spacewalk", rows: 2 }] },
  { w: 1.78, cards: [{ id: "apex-pass", title: "Apex Pass", genre: "Racing", rows: 1 }, { id: "kelp-diver", title: "Kelp Diver", genre: "Ocean survival", rows: 1 }] },
];

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function initStage(root) {
  const video = root.querySelector("[data-reel-video]");
  const next = root.querySelector("[data-reel-next]");
  const title = root.querySelector("[data-reel-title]");
  const genre = root.querySelector("[data-reel-genre]");
  const line = root.querySelector("[data-reel-line]");
  const rail = root.querySelector("[data-reel-rail]");
  const status = root.querySelector("[data-reel-status]");
  const toggle = root.querySelector("[data-reel-toggle]");

  rail.innerHTML = reel
    .map(
      (g, i) => `<button class="reel-tile" type="button" data-i="${i}" aria-label="${g.title} — ${g.genre}" aria-pressed="${i === 0}">
        <img src="landing/explore/posters/${g.id}-thumb.webp" alt="" width="160" height="90" loading="lazy" decoding="async">
        <span class="reel-tile__name">${g.title}</span>
        <span class="reel-tile__bar" aria-hidden="true"><i></i></span>
      </button>`,
    )
    .join("");
  const tiles = [...rail.children];

  let index = 0;
  let paused = false; // user pause
  let visible = false;

  const bar = () => tiles[index].querySelector(".reel-tile__bar i");
  const setBar = (p) => bar().style.setProperty("--p", p);

  function show(i, { play = true } = {}) {
    tiles[index].setAttribute("aria-pressed", "false");
    setBar(0);
    index = (i + reel.length) % reel.length;
    const g = reel[index];
    tiles[index].setAttribute("aria-pressed", "true");
    root.classList.remove("is-swap");
    void root.offsetWidth; // restart the caption rise
    root.classList.add("is-swap");
    title.textContent = g.title;
    genre.textContent = g.genre;
    line.textContent = g.line;
    status.textContent = `${g.title}, ${index + 1} of ${reel.length}`;
    video.poster = `landing/explore/posters/${g.id}.webp`;
    video.src = v(g.id);
    if (play && visible && !paused) video.play().catch(() => {});
    // Warm the next clip's first bytes so the swap does not flash black.
    next.href = v(reel[(index + 1) % reel.length].id);
    tiles[index].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  video.addEventListener("timeupdate", () => {
    if (video.duration) setBar((video.currentTime / video.duration).toFixed(3));
  });
  video.addEventListener("ended", () => show(index + 1));
  rail.addEventListener("click", (e) => {
    const t = e.target.closest(".reel-tile");
    if (!t) return;
    paused = false;
    toggle.setAttribute("aria-pressed", "false");
    show(+t.dataset.i);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(index + 1);
    if (e.key === "ArrowLeft") show(index - 1);
  });
  toggle.addEventListener("click", () => {
    paused = !paused;
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", paused ? "Play showreel" : "Pause showreel");
    paused ? video.pause() : video.play().catch(() => {});
  });

  // Decode only while the stage is on screen.
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !paused) video.play().catch(() => {});
      else video.pause();
    },
    { threshold: 0.25 },
  ).observe(root);

  if (reduced()) {
    paused = true;
    toggle.setAttribute("aria-pressed", "true");
    toggle.setAttribute("aria-label", "Play showreel");
  }
  show(0, { play: false });
}

function initWorlds(root) {
  const track = root.querySelector("[data-worlds-track]");
  track.innerHTML = worlds
    .map(
      (col) => `<div class="worlds-col" style="--w:${col.w}">${col.cards
        .map(
          (c) => `<figure class="worlds-card" style="--rows:${c.rows}">
            <video muted loop playsinline preload="none" poster="landing/gallery/posters/${c.id}.webp" data-src="${v(c.id)}" aria-label="${c.title} gameplay"></video>
            <figcaption><span>${c.genre}</span><strong>${c.title}</strong></figcaption>
          </figure>`,
        )
        .join("")}</div>`,
    )
    .join("");

  const io = new IntersectionObserver(
    (entries) => {
      for (const { target: vid, isIntersecting } of entries) {
        if (isIntersecting) {
          if (!vid.src) vid.src = vid.dataset.src;
          if (!reduced()) vid.play().catch(() => {});
        } else vid.pause();
      }
    },
    { root: track, rootMargin: "0px 120px", threshold: 0.2 },
  );
  // The track is the IO root, so also stop everything when the whole
  // section scrolls out of the page.
  let onPage = false;
  new IntersectionObserver(([e]) => {
    onPage = e.isIntersecting;
    track.querySelectorAll("video").forEach((vid) => (onPage ? io.observe(vid) : (io.unobserve(vid), vid.pause())));
  }).observe(root);

  const step = () => track.clientWidth * 0.8;
  root.querySelector("[data-worlds-prev]").addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  root.querySelector("[data-worlds-next]").addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));

  // Mouse drag-to-scroll (touch already scrolls natively).
  let x0 = 0, s0 = 0, drag = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = true; x0 = e.clientX; s0 = track.scrollLeft;
    track.classList.add("is-drag");
  });
  addEventListener("pointermove", (e) => { if (drag) track.scrollLeft = s0 - (e.clientX - x0); });
  addEventListener("pointerup", () => { drag = false; track.classList.remove("is-drag"); });
}

export function initShowreel() {
  const stage = document.querySelector("[data-reel]");
  const gallery = document.querySelector("[data-worlds]");
  if (stage) initStage(stage);
  if (gallery) initWorlds(gallery);
}
