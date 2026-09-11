import { GameCard } from "./hero-game.js";
import { games, gameAsset } from "./games.js";
import { icon, hydrateIcons } from "./icons.js";
import {
  plans,
  anchorPrice,
  formatCredits,
  yearlySavings,
  monthlyEquivalent,
  MODEL_CATALOG,
  UNLOCK_LABEL,
  ACCESS_PANEL,
  PLAN_DISCOUNT,
  PLANS_URL,
} from "./plans.js";

// Content is sourced from Quadcode's public showcase, not generated customer claims.
const asset = (name) => `landing/${name}`;

const projects = [
  {
    title: "Dragon Flight",
    category: "3D · Flying game",
    image: "dragon.webp",
    alt: "Dragon flying over a volcanic world at sunset",
    description:
      "A flying game set above a volcanic landscape. An example from the Quadcode game and 3D showcase.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Playable Apartment",
    category: "3D · Interactive world",
    image: "apartment.webp",
    alt: "A detailed, sunlit apartment with a kitchen and living room",
    description:
      "A furnished apartment you can explore in the browser. See the original interactive experience in the Quadcode showcase.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Gothic Room",
    category: "3D · Environment",
    image: "goth-room.webp",
    alt: "A candlelit gothic hall with stained-glass windows",
    description:
      "A real-time 3D environment with stained glass, candlelight and editable scene settings.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "Snake Grass",
    category: "3D · Locomotion demo",
    image: "snake.webp",
    alt: "The Snake Grass game shown in the Quadcode showcase",
    description:
      "A real-time snake locomotion demo with steering, sprinting, a cobra pose and tree climbing. This is a capture from the running project, including its developer HUD.",
    url: "https://quadcode.ai/#make-alive",
  },
  {
    title: "3D Chess",
    category: "Game · WebGL",
    image: "chess.webp",
    alt: "Three-dimensional chess game with a rendered chessboard",
    description:
      "A 3D chess project from the software examples on Quadcode. Explore the game in the original developer showcase.",
    url: "https://quadcode.ai/#capabilities",
  },
];
const agents = [
  { name: "Cody", role: "Code & development", image: "cody.jpg" },
  { name: "Lumi", role: "Design & visuals", image: "lumi.jpg" },
  { name: "Sonic", role: "Motion & sound", image: "sonic.jpg" },
];
const featureData = [
  {
    title: "Your idea.<br>A real project.",
    copy: "Describe the game you want to make. Your agents write the code, create the assets and run the project — right in your own files, not a disposable sandbox.",
    tags: ["Real project files", "Code & assets", "Run locally"],
    visual: "project",
  },
  {
    title: "A team, not<br>just a chatbot.",
    copy: "Cody builds the logic. Lumi designs the world. Sonic brings it to life with motion and sound. Specialized agents, working together on one project.",
    tags: ["Specialized agents", "Shared context", "Your models"],
    visual: "team",
  },
  {
    title: "3D worlds from<br>a sentence.",
    copy: "Imagine an environment, a character or a whole new world. Work with integrated creative tools to build 3D assets and bring them into your game.",
    tags: ["3D assets", "Environments", "Characters"],
    visual: "world",
  },
];
const faqData = [
  [
    "What is Quadcode AI?",
    "Quadcode is a desktop creative workspace where specialized AI agents help you build games, apps, websites, visuals and audio. They work with real project files and tools, not just messages in a chat.",
  ],
  [
    "Do I need to know how to code?",
    "You can start by describing your idea in plain language. Your agents help with the implementation. If you write code, you can inspect and edit the project directly, use Git and debug it in the same workspace.",
  ],
  [
    "Why a desktop app, not a browser tab?",
    "The app works directly in your project folder. Agents can read and write files, run build steps and use local tools such as Unity, Blender and your command-line programs. Quadcode is available for macOS and Windows.",
  ],
  [
    "Can I use my own models and tools?",
    "Quadcode supports multiple model providers and connects to tools through MCP and local integrations. You can also orchestrate agentic CLIs such as Claude Code and Codex alongside your existing workflow.",
  ],
  [
    "Can it help with 3D, music and sound?",
    "Yes. Specialized agents work with integrated models and tools for 3D assets, images, animation, voice, music and sound effects. The exact workflow depends on your project and the tools you choose.",
  ],
  [
    "Where should I start?",
    "Get the desktop app from quadcode.ai, open a project and describe what you want to build. The community library includes step-by-step guides, skills and ready-to-go projects to explore.",
  ],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const tags = (items) =>
  `<div class="tags">${items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>`;

function featureVisual(type) {
  if (type === "project") {
    return `<div class="project-window"><div class="window-bar"><span class="window-dots" aria-hidden="true">●●●</span><span>quadcode.ai · your workspace</span><span>${icon("expand")}</span></div><video class="project-window__video" data-feature-video src="${asset("quadcode-ide.mp4")}" poster="${asset("quadcode-ide.webp")}" width="1280" height="720" muted loop playsinline preload="metadata" aria-label="Quadcode desktop interface: a prompt is typed, GPT-6 Astra edits the project files, and the running game appears in the Result tab"></video></div><div class="project-prompt"><span>Example prompt</span><p>Build a 3D adventure. Make it my own.</p><footer><span>Code · Visuals · Sound</span>${icon("arrow-up", "i send-symbol")}</footer></div>`;
  }
  if (type === "team") {
    return `<div class="team-composition"><div class="team-label">One brief. Your own creative team.</div><div class="agent-portraits">${agents.map((agent) => `<div class="portrait"><img src="${asset(agent.image)}" alt="${agent.name}, Quadcode ${agent.role.toLowerCase()} agent" width="200" height="250" loading="lazy"><div class="portrait-caption"><strong>${agent.name}</strong><span>${escapeHtml(agent.role)}</span></div></div>`).join("")}</div><div class="team-prompt">Your game. Everyone on the same page.</div></div>`;
  }
  return `<img src="${asset("goth-room.webp")}" alt="Gothic room built with Quadcode: stained glass, volumetric lighting and candles" width="1280" height="720" loading="lazy"><div class="world-caption"><span class="eyebrow">Built with Quadcode</span><strong>A world worth exploring.</strong><p>Gothic Room · Real-time 3D environment</p></div>`;
}

// ---- Pricing cards ---------------------------------------------------------
// Card anatomy, top to bottom, in the order a buyer actually reads:
//   name → one-line pitch → CREDITS (the thing compared, biggest type, in its
//   own well) → price with the struck anchor → CTA → "save $X" (yearly only,
//   computed) → MODEL LADDER (every model family with a state: included,
//   capped, or locked with the tier that opens it) → short checklist → billing.
// The CTA sits above the lists on purpose: the button is visible before the
// reader has committed to scanning six rows of models.
// The featured tier gets a gradient hairline and a lighter fill, never extra
// height — a taller middle card knocks the row off its baseline and reads as
// a layout bug rather than a recommendation.
// One row of the ladder reads as a table line: ROLE · model · [ceiling] · state.
//   full    → ✓  name            [1080p]  Included
//   capped  → ✓  name            [720p]   Up to 720p   (the ceiling IS the state)
//   locked  → ✕  name (dimmed)            From Pro     (peach outline: a pointer)
function modelRowMarkup(entry, access) {
  const locked = access == null;
  const capped = !locked && access.state === "capped";
  const limit = !locked && access.limit && !capped ? `<span class="plan-chip plan-chip--limit">${escapeHtml(access.limit)}</span>` : "";
  const state = locked ? UNLOCK_LABEL : capped ? `Up to ${access.limit}` : "Included";
  const stateClass = locked ? " plan-chip--locked" : capped ? " plan-chip--capped" : " plan-chip--on";
  return `<li class="plan-model${locked ? " plan-model--locked" : ""}">
    ${icon(locked ? "x" : "check", "i plan-model__mark")}
    <span class="plan-model__role">${escapeHtml(entry.role)}</span>
    <span class="plan-model__name">${escapeHtml(entry.name)}</span>
    <span class="plan-model__chips">${limit}<span class="plan-chip${stateClass}">${escapeHtml(state)}</span></span>
  </li>`;
}

// Price line. Everything is normalised to a month so the three cards share
// one unit: a yearly plan shows its per-month figure big and the actual
// charge small — "$15 / month · $180 billed once" — because "$180" against
// "$29" is not a comparison anyone can make in their head.
function priceMarkup(plan) {
  const perMonth = monthlyEquivalent(plan);
  const wasPerMonth = anchorPrice(plan.price) / (plan.per === "year" ? 12 : 1);
  const billed =
    plan.per === "year"
      ? `<span class="plan-price__billed">$${plan.price} billed once a year</span>`
      : `<span class="plan-price__billed">billed monthly</span>`;
  return `<p class="plan-price">
    <s aria-label="Regular price">$${wasPerMonth}</s>
    <strong>$${perMonth}</strong>
    <span class="plan-price__per">/ month</span>
    ${billed}
  </p>`;
}

function planCardMarkup(plan) {
  const discount = `${Math.round(PLAN_DISCOUNT * 100)}% off`;
  const savings = yearlySavings(plan);
  const lockedCount = MODEL_CATALOG.filter((entry) => plan.models[entry.id] == null).length;
  const panel = lockedCount ? ACCESS_PANEL.partial : ACCESS_PANEL.full;
  const tierClass = plan.featured ? " plan-card--featured" : plan.per === "year" ? " plan-card--yearly" : "";
  return `<article class="plan-card${tierClass}" data-plan="${plan.id}" data-reveal>
    <header class="plan-card__head">
      <h3>${escapeHtml(plan.name)}</h3>
      <span class="plan-badges">
        <span class="plan-badge plan-badge--discount">${discount}</span>
        ${plan.badge ? `<span class="plan-badge">${escapeHtml(plan.badge)}</span>` : ""}
      </span>
    </header>
    <p class="plan-pitch">${escapeHtml(plan.pitch)}</p>
    <div class="plan-credits">
      <p class="plan-credits__figure">${icon("sparkles", "i plan-credits__icon")}<strong>${formatCredits(plan.credits)}</strong><span>${escapeHtml(plan.unit)}</span></p>
      <ul class="plan-credits__facts">
        <li>${icon("check")}Fixed amount · refilled every month · one pool for everything</li>
      </ul>
    </div>
    ${priceMarkup(plan)}
    <div class="plan-action">
      <a class="button${plan.featured ? "" : " secondary"} plan-cta" href="${PLANS_URL}">${escapeHtml(plan.cta)} ${icon("arrow-right")}</a>
      ${
        savings
          ? `<p class="plan-savings plan-savings--win">Save <strong>$${savings}</strong> vs 12 × Monthly Pro</p>`
          : `<p class="plan-savings">${escapeHtml(plan.billing)}</p>`
      }
    </div>
    <section class="plan-models${lockedCount ? "" : " plan-models--full"}" aria-label="Models included in ${escapeHtml(plan.name)}">
      <header class="plan-models__head">
        <span class="plan-models__mark">${icon(lockedCount ? "lock" : "lock-open")}</span>
        <div>
          <h4>${escapeHtml(panel.title)}</h4>
          <p>${escapeHtml(panel.note)}</p>
        </div>
      </header>
      <ul>${MODEL_CATALOG.map((entry) => modelRowMarkup(entry, plan.models[entry.id])).join("")}</ul>
    </section>
    <ul class="plan-perks">${plan.features
      .map((feature) => `<li>${escapeHtml(feature)}</li>`)
      .join("")}</ul>
  </article>`;
}

function renderContent() {
  $("#feature-list").innerHTML = featureData
    .map(
      (feature, index) =>
        `<article class="feature"><div class="container feature-inner"><div class="feature-copy" data-reveal><span class="feature-number">0${index + 1} / CREATE WITHOUT THE CHAOS</span><h3>${feature.title}</h3><p>${escapeHtml(feature.copy)}</p>${tags(feature.tags)}</div><div class="feature-visual visual-${feature.visual}" data-reveal>${featureVisual(feature.visual)}</div></div></article>`,
    )
    .join("");
  $("#plan-list").innerHTML = plans.map(planCardMarkup).join("");
  $("#faq-list").innerHTML = faqData
    .map(
      ([question, answer], index) =>
        `<details class="faq-item" data-reveal${index === 0 ? " open" : ""}><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`,
    )
    .join("");
  $("#year").textContent = new Date().getFullYear();
}

// Shared cyclic selection, keyboard and swipe behavior for both galleries.
class Carousel {
  constructor(root, count, onChange) {
    this.root = root;
    this.count = count;
    this.index = 0;
    this.onChange = onChange;
    this.start = null;
    root.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      this.move(event.key === "ArrowLeft" ? -1 : 1);
    });
    root.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        this.start = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      },
      { passive: true },
    );
    root.addEventListener(
      "touchend",
      (event) => {
        if (!this.start) return;
        const deltaX = event.changedTouches[0].clientX - this.start.x;
        const deltaY = event.changedTouches[0].clientY - this.start.y;
        this.start = null;
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5)
          this.move(deltaX < 0 ? 1 : -1);
      },
      { passive: true },
    );
    root.addEventListener("touchcancel", () => {
      this.start = null;
    });
  }
  select(index) {
    this.index = ((index % this.count) + this.count) % this.count;
    this.onChange(this.index);
  }
  move(step) {
    this.select(this.index + step);
  }
}

// ---- Hero: one card per game in the registry -------------------------------
const pad = (n) => String(n).padStart(2, "0");

function controlsMarkup(controls = []) {
  return `<ul class="hero-game__controls">${controls
    .map(
      (row) =>
        `<li>${row.keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join("")}<span>${escapeHtml(row.label)}</span></li>`,
    )
    .join("")}</ul>`;
}

function posterMarkup(game, index) {
  return `<img class="hero-game__poster-img" src="${gameAsset(game.poster)}" alt="${escapeHtml(game.posterAlt ?? "")}" width="1880" height="1042" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
}

function gameCardMarkup(game, index, total) {
  const position = index === 0 ? "center" : index === 1 ? "right" : index === total - 1 ? "left" : "back";
  const action = `<a class="button hero-game__play" data-game-play href="${game.embed}" aria-label="Play ${escapeHtml(game.title)}"><span class="hero-game__play-icon" aria-hidden="true">${icon("play")}</span><span data-game-play-label>Play</span></a>`;
  return `<article class="hero-card hero-card--game" data-game="${game.id}" data-state="preview" data-position="${position}" aria-roledescription="slide" aria-label="${index + 1} of ${total}: ${escapeHtml(game.title)}, playable">
    <div class="hero-game__mount" data-game-mount></div>
    <div class="hero-game__poster" data-game-poster>${posterMarkup(game, index)}</div>
    <div class="hero-game__chip"><span>${pad(index + 1)}</span>${escapeHtml(game.category)}</div>
    <button class="hero-game__exit" type="button" data-game-exit aria-label="Exit ${escapeHtml(game.title)}">${game.id === "strike" ? "" : "<kbd>Esc</kbd>"}Exit ${icon("x")}</button>
    <!-- Reading order is the point of this structure. Play used to be the
         copy block's second child, bottom-aligned against a column that
         ended in two rows of keyboard chips — so the page's second most
         important action shared a baseline with its least important line
         and sat 170px away from the sentence that sells it. It now closes
         the left column: title, one sentence, button. The key legend is a
         legend, so it goes to the right and stays out of the path. -->
    <div class="hero-card-copy hero-game__copy">
      <div class="hero-game__pitch">
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.description)}</p>
        ${action}
        <span class="hero-game__status" data-game-status aria-live="polite"></span>
      </div>
      ${controlsMarkup(game.controls)}
    </div>
    <button class="hero-card-cover" aria-label="Show ${escapeHtml(game.title)}" data-featured="${index}"></button>
  </article>`;
}

function initializeHero() {
  const total = games.length;
  $("#hero-cards").innerHTML = games
    .map((game, index) => gameCardMarkup(game, index, total))
    .join("");
  const cards = $$(".hero-card--game");
  const controllers = cards.map((card, index) => new GameCard(card, games[index]));
  // Moving a card between the two side slots means crossing the entire deck.
  // Animated, that is a dimmed card sliding ~1000px through the middle of
  // the composition, behind the one the viewer is actually looking at — the
  // single biggest reason switching felt untidy. So that one card cuts
  // instead: fade out, jump while invisible, fade back in. The two cards
  // that matter (the one arriving at the centre and the one leaving it)
  // still travel, so the deck reads as continuous.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const OPPOSITE = { left: "right", right: "left" };
  const setPosition = (card, next) => {
    const previous = card.dataset.position;
    if (previous === next) return;
    if (reduced.matches || OPPOSITE[previous] !== next) {
      card.dataset.position = next;
      return;
    }
    card.classList.add("is-hopping");
    clearTimeout(card.hopTimer);
    card.hopTimer = setTimeout(() => {
      card.dataset.position = next;
      // Force the teleport to land in its own style flush, otherwise the
      // browser coalesces it with the class removal below and animates the
      // very slide we are trying to avoid.
      void card.offsetWidth;
      card.classList.remove("is-hopping");
    }, 190);
  };

  const controller = new Carousel($(".hero-showcase"), total, (active) => {
    cards.forEach((card, index) => {
      const distance = (index - active + total) % total;
      setPosition(
        card,
        distance === 0 ? "center" : distance === 1 ? "right" : distance === total - 1 ? "left" : "back",
      );
      $(".hero-card-cover", card).setAttribute(
        "aria-label",
        `${distance === 0 ? "Selected: " : "Show "}${games[index].title}`,
      );
      controllers[index].setCentered(distance === 0);
    });
    $("#hero-counter").textContent = `${pad(active + 1)} / ${pad(total)}`;
  });
  $("#hero-counter").textContent = `01 / ${pad(total)}`;
  $("[data-hero-prev]").addEventListener("click", () => controller.move(-1));
  $("[data-hero-next]").addEventListener("click", () => controller.move(1));
  $$("[data-featured]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.featured);
      if (index !== controller.index) controller.select(index);
    }),
  );
  // Opened with #play (e.g. from the nav CTA): start the first game at once.
  if (location.hash === "#play" && games[0].status === "live") controllers[0].play();
}

function initializeGallery() {
  $("#gallery-thumbnails").innerHTML = projects
    .map(
      (project, index) =>
        `<button class="gallery-thumb" aria-label="Show ${project.title}" aria-current="${index === 0}" data-project="${index}"><img src="${asset(project.image)}" alt="" width="90" height="90" loading="lazy"></button>`,
    )
    .join("");
  const image = $("#gallery-image");
  const controller = new Carousel($(".gallery"), projects.length, (index) => {
    const project = projects[index];
    image.src = asset(project.image);
    image.alt = project.alt;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      image.getAnimations().forEach((animation) => animation.cancel());
      image.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 340,
        easing: "ease-out",
      });
    }
    $("#gallery-title").textContent = project.title;
    $("#gallery-category").textContent = project.category;
    $("#gallery-status").textContent =
      `${project.title} · ${index + 1} of ${projects.length}`;
    $$(".gallery-thumb").forEach((thumb, thumbIndex) =>
      thumb.setAttribute("aria-current", String(thumbIndex === index)),
    );
  });
  $(".gallery-prev").addEventListener("click", () => controller.move(-1));
  $(".gallery-next").addEventListener("click", () => controller.move(1));
  $$("[data-project]").forEach((button) =>
    button.addEventListener("click", () =>
      controller.select(Number(button.dataset.project)),
    ),
  );
  $("#open-preview").addEventListener("click", () =>
    openProject(projects[controller.index]),
  );
}

let previouslyFocused = null;
function openProject(project) {
  const dialog = $("#project-dialog");
  previouslyFocused = document.activeElement;
  $("#dialog-image").src = asset(project.image);
  $("#dialog-image").alt = project.alt;
  // Videos are local official captures, loaded only after an explicit preview click.
  const video = document.createElement("video");
  video.id = "dialog-video";
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.preload = "none";
  video.poster = asset(project.image);
  video.setAttribute("aria-label", `${project.title} gameplay recording`);
  video.src = asset(project.image.replace(".webp", ".mp4"));
  video.addEventListener(
    "error",
    () => {
      video.hidden = true;
      $("#dialog-image").hidden = false;
      $("#dialog-description").textContent =
        "The video could not load. You can still explore this project on the official Quadcode site.";
    },
    { once: true },
  );
  $("#dialog-image").hidden = true;
  $("#dialog-image").before(video);
  video.play().catch(() => {
    /* Native controls remain available if autoplay is blocked. */
  });
  $("#dialog-title").textContent = project.title;
  $("#dialog-description").textContent = project.description;
  $("#dialog-link").href = project.url;
  dialog.showModal();
  dialog.scrollTop = 0;
  document.body.classList.add("modal-open");
  $(".dialog-close").focus({ preventScroll: true });
}
function initializeDialog() {
  const dialog = $("#project-dialog");
  // Animated close: play the reverse keyframes, then really close. A
  // second click during the 200ms is ignored rather than double-closing.
  const closeAnimated = () => {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dialog.classList.remove("is-closing");
      dialog.close();
    };
    dialog.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 260); // belt: never leave a modal stuck half-closed
  };
  $(".dialog-close").addEventListener("click", closeAnimated);
  dialog.addEventListener("cancel", (event) => {
    // Esc: route through the same exit animation.
    event.preventDefault();
    closeAnimated();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      closeAnimated();
  });
  dialog.addEventListener("close", () => {
    const video = $("#dialog-video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    $("#dialog-image").hidden = false;
    document.body.classList.remove("modal-open");
    previouslyFocused?.focus({ preventScroll: true });
  });
}
function initializeNavigation() {
  const toggle = $(".menu-toggle");
  const nav = $("#main-nav");
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  };
  toggle.addEventListener("click", () =>
    setOpen(toggle.getAttribute("aria-expanded") !== "true"),
  );
  $$("a", nav).forEach((link) =>
    link.addEventListener("click", () => setOpen(false)),
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      setOpen(false);
      toggle.focus();
    }
  });
  nav.addEventListener("focusout", () =>
    setTimeout(() => {
      if (
        !nav.contains(document.activeElement) &&
        document.activeElement !== toggle
      )
        setOpen(false);
    }, 0),
  );
  matchMedia("(min-width:901px)").addEventListener("change", () =>
    setOpen(false),
  );

  // Scroll-spy. The underline under a nav item is a claim about where you
  // are; a static class makes it lie from the second screen down. The
  // active section is the last one whose top has passed a line 35% down
  // the viewport — past the header, before the middle, so a short section
  // still gets its turn.
  const links = $$("a[href^='#']", nav);
  const targets = links
    .map((link) => ({ link, section: $(link.getAttribute("href")) }))
    .filter((entry) => entry.section);
  if (!targets.length) return;
  let current = null;
  const spy = () => {
    const line = innerHeight * 0.35;
    let active = targets[0];
    for (const entry of targets) {
      if (entry.section.getBoundingClientRect().top <= line) active = entry;
    }
    if (active === current) return;
    current = active;
    for (const { link } of targets) {
      const on = link === active.link;
      link.classList.toggle("nav-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  };
  addEventListener("scroll", spy, { passive: true });
  addEventListener("resize", spy);
  spy();
}

// ---- Scroll reveal: one observer for the whole page ------------------------
// Tags `h2`, `h2 + p` and anything with [data-reveal] inside every section
// and the footer as `.sr`, and the section root itself as `.section-fade`, so
// a block arrives as one unit instead of "heading fades, grid pops".
// Stagger is decided per reveal batch (60ms a step, four steps max), never by
// DOM position: a card three screens down should not inherit a delay it never
// earned. Reveal happens once; scrolling back up never re-hides content.
// The hero is skipped — it owns the game embed and nothing there should be
// at opacity 0 while a canvas is warming up.
function initializeReveal() {
  if (typeof IntersectionObserver === "undefined") return;
  const aboveFold = (el) =>
    scrollY === 0 && el.getBoundingClientRect().bottom < innerHeight * 0.5;

  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach((entry, index) => {
          const el = entry.target;
          el.style.setProperty("--sr-delay", `${Math.min(index, 4) * 60}ms`);
          el.classList.add(
            el.classList.contains("section-fade") ? "section-fade-in" : "sr-in",
          );
          observer.unobserve(el);
        });
    },
    // ~12% into the viewport from the bottom: early enough that the rise
    // finishes while the element is still low on screen, late enough to be seen.
    { rootMargin: "0px 0px -12% 0px", threshold: 0 },
  );

  $$("main > section, footer").forEach((section) => {
    if (section.classList.contains("hero")) return;
    if (!aboveFold(section)) {
      section.classList.add("section-fade");
      observer.observe(section);
    }
    $$("h2, h2 + p, [data-reveal]", section).forEach((el) => {
      if (el.classList.contains("sr") || aboveFold(el)) return;
      el.classList.add("sr");
      observer.observe(el);
    });
  });
}

// ---- Skeletons -------------------------------------------------------------
// Every content image sits in a shimmering placeholder until it has decoded.
// Containers are picked by selector, not "img.parentElement", because a
// wrapper that's already position:absolute (the game poster) must not be
// forced relative. Already-cached images resolve on the same tick, so a
// warm reload shows no shimmer at all.
function initializeSkeletons() {
  const containers = $$(
    ".hero-game__poster, .gallery-viewport, .gallery-thumb, .project-window, .app-tile, .portrait, .tool-tile, .footer-brand, #project-dialog .dialog-media",
  );
  containers.forEach((box) => {
    const img = box.querySelector("img");
    if (!img) return;
    const done = () => {
      box.classList.remove("skel");
      box.classList.add("skel-done");
    };
    if (img.complete && img.naturalWidth) return; // cached: no flash
    box.classList.add("skel");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

// ---- FAQ accordion ---------------------------------------------------------
// <details> snaps open/closed. We keep it (free a11y, works without JS) but
// drive the height ourselves: measure, animate 0→h or h→0 on the answer,
// and only flip `open` after the close animation so the box doesn't vanish
// mid-collapse. Opening one closes the others — one question at a time.
function initializeFaq() {
  const items = $$(".faq-item");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  // Padding collapses with the height, otherwise a 21px band of nothing
  // stays visible at the "closed" end of the animation.
  const frame = (p, h, on) => {
    const cs = getComputedStyle(p);
    return {
      height: `${h}px`,
      paddingTop: on ? cs.paddingTop : "0px",
      paddingBottom: on ? cs.paddingBottom : "0px",
      opacity: on ? 1 : 0,
    };
  };
  const animate = (p, from, to) =>
    p.animate([frame(p, from, !!from), frame(p, to, !!to)], {
      duration: 280,
      easing: EASE,
    }).finished;

  const close = async (item) => {
    const p = item.querySelector("p");
    if (!reduced && p) {
      p.style.overflow = "hidden";
      await animate(p, p.offsetHeight, 0).catch(() => {});
      p.style.overflow = "";
    }
    item.open = false;
  };
  const open = async (item) => {
    const p = item.querySelector("p");
    item.open = true;
    if (reduced || !p) return;
    const h = p.offsetHeight;
    p.style.overflow = "hidden";
    await animate(p, 0, h).catch(() => {});
    p.style.overflow = "";
  };

  items.forEach((item) => {
    item.querySelector("summary").addEventListener("click", (event) => {
      event.preventDefault();
      if (item.open) close(item);
      else {
        items.filter((other) => other !== item && other.open).forEach(close);
        open(item);
      }
    });
  });
}

// ---- Feature clips ---------------------------------------------------------
// A muted loop that decodes while it is three screens away is a tax on every
// visitor's battery. The clip loads and plays only while it is on screen, and
// with `prefers-reduced-motion: reduce` it never plays at all — the poster is
// the same frame, so the slide still reads.
function initializeFeatureVideo() {
  const videos = $$("[data-feature-video]");
  if (!videos.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          if (target.preload !== "auto") target.preload = "auto";
          target.play().catch(() => {
            /* Autoplay refused: the poster stays, nothing breaks. */
          });
        } else if (!target.paused) {
          target.pause();
        }
      });
    },
    { threshold: 0.35 },
  );
  videos.forEach((video) => observer.observe(video));

  // A backgrounded tab keeps rAF-throttled video decoding alive in some
  // browsers; stop it explicitly and resume only if still in view.
  document.addEventListener("visibilitychange", () => {
    videos.forEach((video) => {
      if (document.hidden) video.pause();
      else if (video.getBoundingClientRect().top < innerHeight)
        video.play().catch(() => {});
    });
  });
}

// ---- Header: transparent, and it gets out of the way -----------------------
// No shelf, no fill. The nav's only state is presence: scroll down and it
// lifts off the top edge, scroll up and it comes back (CSS owns the motion —
// see `.site-header.is-hidden`).
// Direction is read from an accumulator, not from the sign of a single
// scroll event. A trackpad emits a 1px event in the wrong direction all the
// time, and a raw sign test makes the header strobe. Travel is summed while
// the direction holds and reset the moment it flips, so the header only
// moves once the reader has actually committed: 64px down to hide it (one
// header's worth — below that you are still reading the same line), 24px up
// to bring it back (going back is an intention, it should feel instant).
// Two overrides: the top of the page always shows it, and so does keyboard
// focus landing inside it — a Tab stop you cannot see is a broken page.
function initializeHeaderAutoHide() {
  const header = $(".site-header");
  const TOP_ZONE = 80;
  const COMMIT_DOWN = 64;
  const COMMIT_UP = 24;
  let last = Math.max(0, scrollY);
  let travel = 0;
  let hidden = false;
  let queued = false;

  const setHidden = (next) => {
    if (next === hidden) return;
    hidden = next;
    header.classList.toggle("is-hidden", next);
  };

  const update = () => {
    queued = false;
    const y = Math.max(0, scrollY);
    const step = y - last;
    last = y;
    if (y <= TOP_ZONE) {
      travel = 0;
      setHidden(false);
      return;
    }
    travel = (travel > 0) === (step > 0) ? travel + step : step;
    if (travel > COMMIT_DOWN) setHidden(true);
    else if (travel < -COMMIT_UP) setHidden(false);
  };

  addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  header.addEventListener("focusin", () => {
    travel = 0;
    setHidden(false);
  });
  update();
}

renderContent();
hydrateIcons();
initializeDialog();
initializeHero();
initializeGallery();
initializeNavigation();
initializeReveal();
initializeSkeletons();
initializeFaq();
initializeFeatureVideo();
initializeHeaderAutoHide();
