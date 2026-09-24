// ---------------------------------------------------------------------------
// TESTIMONIALS — placeholder reviews (PO request: fake quotes until real
// ones are collected). Layout mirrors the Higgsfield "trusted by" rail:
// white section, cards with a person row + inner quote card, arrow nav.
// Replace `reviews` with real quotes before any paid traffic claims them.
// ---------------------------------------------------------------------------

// Copy rules: one idea per quote, two or three short sentences, concrete
// detail over praise. No claims the product page doesn't make.
const reviews = [
  { name: "Marco D.", role: "Indie developer", text: "I described a dungeon crawler at lunch and was playing it by evening. The polish took a weekend, not three months." },
  { name: "Aisha K.", role: "Game design student", text: "We used it at a game jam. Code, props and music came from one thread, so all 48 hours went into gameplay." },
  { name: "Tom R.", role: "Solo creator", text: "It works in my actual project folder. Scripts, models and textures are just there. Nothing to export." },
  { name: "Lena V.", role: "Technical artist", text: "I asked for a snowy pass lit by lanterns. Terrain, props and lighting all came out in the same style." },
  { name: "Daniel P.", role: "Mobile studio lead", text: "A new mechanic is an afternoon now. If it doesn't play well, we've lost two hours instead of two sprints." },
  { name: "Yuki S.", role: "Streamer", text: "I built a paintball arena on stream from chat suggestions. Twenty minutes later we were playing it." },
  { name: "Chris M.", role: "Hobbyist", text: "I don't code. I said what I wanted and fixed what felt off. Now my kids play our racing game every day." },
  { name: "Nora B.", role: "Unity developer", text: "Art and sound go to their own agents while I review the logic. It's the first AI workflow that actually saves me time." },
];

const star =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z"/></svg>';

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const initials = (name) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 1)
    .toUpperCase();

function card(r, i) {
  return `<article class="tm-card" aria-label="Review ${i + 1} of ${reviews.length}">
    <header class="tm-card__head">
      <div class="tm-card__who">
        <span class="tm-avatar" aria-hidden="true">${initials(r.name)}</span>
        <span class="tm-card__name"><strong>${esc(r.name)}</strong><small>${esc(r.role)}</small></span>
      </div>
      <span class="tm-stars" role="img" aria-label="5 out of 5">${star.repeat(5)}</span>
    </header>
    <blockquote class="tm-card__quote"><p>${esc(r.text)}</p></blockquote>
  </article>`;
}

export function initTestimonials(root = document) {
  const track = root.querySelector("[data-tm-track]");
  if (!track) return;
  track.innerHTML = reviews.map(card).join("");
  const step = () => {
    const first = track.querySelector(".tm-card");
    return first ? first.getBoundingClientRect().width + 20 : 400;
  };
  root.querySelector("[data-tm-prev]")?.addEventListener("click", () =>
    track.scrollBy({ left: -step(), behavior: "smooth" }),
  );
  root.querySelector("[data-tm-next]")?.addEventListener("click", () =>
    track.scrollBy({ left: step(), behavior: "smooth" }),
  );
}
