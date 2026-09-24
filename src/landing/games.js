/**
 * The games shown in the hero carousel.
 *
 * Exactly three playable games, one entry each. The carousel renders what is
 * here and nothing else — no placeholders, no "coming soon" slot. Adding a
 * fourth game means adding a finished, playable one.
 *
 *   id          stable slug; also the CSS hook `data-game="<id>"`
 *   status      'live' → Play embeds `embed` (desktop) or opens it (touch)
 *   embed       same-origin page that boots the game; receives `?embed`
 *   poster      still frame shown before Play; `landing/games/<poster>`
 *   controls    short hint rows rendered under the title in preview state
 *   escExits    default true; set false when the game claims Esc for itself,
 *               so the card's Exit button stops promising that shortcut
 */
export const games = [
  {
    id: "elemental",
    title: "Elemental Sandbox",
    category: "Playable now · 3D action",
    description:
      "One character, six casts. Pick a spell, aim at the floor and knock the training targets over.",
    controls: [
      { keys: ["Q", "W", "E", "R", "D", "F"], label: "pick a cast" },
      { keys: ["Click"], label: "fire at the floor" },
      { keys: ["Right-drag"], label: "orbit · scroll to zoom" },
    ],
    poster: "elemental.webp", // 1880×1042, 56 KB — 2× the card's rendered size
    posterAlt:
      "A caster in a brown coat on a dark arena, glowing wireframe training dummies around them",
    embed: "play.html",
    status: "live",
  },
  {
    id: "rocket",
    title: "Rocket Arena",
    category: "Playable now · car soccer",
    description:
      "Rocket-powered car soccer. Drive, boost, jump and flip, then put the ball in the orange net before time runs out.",
    controls: [
      { keys: ["W", "A", "S", "D"], label: "drive · steer" },
      { keys: ["Space"], label: "jump · tap twice to flip" },
      { keys: ["Shift"], label: "boost · Ctrl to powerslide" },
    ],
    poster: "rocket.webp",
    posterAlt:
      "A blue rocket car on a neon-lit indoor pitch, the ball ahead of it and the orange goal in the distance",
    embed: "rocket.html",
    status: "live",
  },
  {
    id: "strike",
    title: "Paint Strike",
    category: "Playable now · desktop shooter",
    description:
      "Paintball with five bots: pick a side, hold the corridor, and put a splash of your colour on everyone who turns it.",
    controls: [
      { keys: ["W", "A", "S", "D"], label: "move · Shift to walk" },
      { keys: ["Mouse"], label: "aim · click to shoot" },
      { keys: ["R"], label: "reload · Space to jump" },
    ],
    poster: "strike.webp",
    posterAlt:
      "A teal paintball marker aimed toward colourful corridor doorways, with paint splashes across the walls",
    embed: "strike.html",
    status: "live",
    // Paint Strike takes the pointer, and Esc inside it releases the lock
    // and opens the game's own pause menu — it does NOT leave the card. So
    // the card's Exit button must not advertise Esc as the way out. This is
    // a field rather than an `id === "strike"` check in the renderer: the
    // next pointer-locking game would have silently inherited the wrong
    // hint.
    escExits: false,
  },
];

export const gameAsset = (name) => `landing/games/${name}`;
