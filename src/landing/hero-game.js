/**
 * One hero slot = one game card with three states.
 *
 *   preview   poster + copy + Play. Nothing loaded; the page scrolls normally
 *             even with the pointer over the card.
 *   loading   Play pressed: the iframe (`<embed>?embed`) is created and boots.
 *   playing   the scene reported ready. The poster fades, the copy steps
 *             aside, an Exit chip appears. Wheel and keys now belong to the
 *             game: the iframe consumes wheel for zoom, and the card itself
 *             swallows any wheel that lands on the overlay chrome, so a visitor
 *             cannot scroll the page out from under a cast by accident.
 *
 * Leaving `playing` (Exit, Esc inside the game, switching slot, or a click
 * anywhere outside the card) destroys the iframe — GPU work stops the moment
 * the visitor stops playing.
 *
 * Touch devices never embed: Play opens the game page full-screen, because its
 * touch HUD is built for a whole viewport, not a 75%-wide card.
 *
 * Messages (same origin):
 *   ← qc:ready           scene interactive
 *   ← qc:exit            Esc pressed with nothing armed
 *   → qc:active {active} card is / is not the centre of the carousel
 */
const READY = "qc:ready";
const EXIT = "qc:exit";
const ACTIVE = "qc:active";

export const canEmbed = () =>
  window.matchMedia("(min-width: 900px)").matches &&
  !window.matchMedia("(pointer: coarse)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const swallowWheel = (event) => event.preventDefault();

export class GameCard {
  /**
   * @param {HTMLElement} card   the `.hero-card--game` element
   * @param {object} game        registry entry (see games.js)
   * @param {{ onStateChange?: (state: string) => void }} [hooks]
   */
  constructor(card, game, hooks = {}) {
    this.card = card;
    this.game = game;
    this.hooks = hooks;
    this.state = "preview";
    this.frame = null;
    this.centered = card.dataset.position === "center";

    this.mount = card.querySelector("[data-game-mount]");
    this.status = card.querySelector("[data-game-status]");
    this.playButton = card.querySelector("[data-game-play]");
    this.exitButton = card.querySelector("[data-game-exit]");

    this._onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== this.frame?.contentWindow) return;
      if (event.data?.type === READY) this._setState("playing");
      if (event.data?.type === EXIT) this.exit();
      if (event.data?.type === "qc:error") this.fail();
    };
    this._onOutsidePointer = (event) => {
      if (!this.card.contains(event.target)) this.exit();
    };
    this._onKey = (event) => {
      if (event.key === "Escape") this.exit();
    };

    if (game.status !== "live") return;

    if (canEmbed()) {
      this.playButton?.addEventListener("click", (event) => {
        event.preventDefault();
        this.play();
      });
    } else {
      // Touch: the button stays a plain link to the full-screen page.
      this.card.classList.add("is-poster-only");
    }
    this.exitButton?.addEventListener("click", () => this.exit());
  }

  /* ---------------------------------------------------------------- */

  play() {
    if (this.frame || !this.centered || this.game.status !== "live") return;
    this._setState("loading");

    const frame = document.createElement("iframe");
    frame.className = "hero-game__frame";
    const url = new URL(this.game.embed, location.href);
    url.searchParams.set("embed", "");
    if (new URLSearchParams(location.search).has("fps")) url.searchParams.set("fps", "");
    frame.src = url.href;
    frame.title = `${this.game.title} — playable`;
    // Unsandboxed same-origin frames can request pointer lock from a real user click.
    // pointer-lock is not a Permissions Policy feature and must not appear in allow.
    frame.setAttribute("allow", "fullscreen; autoplay");
    document.addEventListener("pointerdown", this._onOutsidePointer, true);
    document.addEventListener("keydown", this._onKey);
    this.loadTimer = setTimeout(() => this.fail(), 60000);
    frame.tabIndex = 0;
    this.mount.appendChild(frame);
    this.frame = frame;

    window.addEventListener("message", this._onMessage);
    // Overlay chrome (Exit chip, status) sits on the parent document; a wheel
    // over it would scroll the page. Inside the iframe the game handles wheel.
    this.card.addEventListener("wheel", swallowWheel, { passive: false });
  }

  fail() {
    if (!this.frame) return;
    this.exit();
    this.status.textContent = "Game could not start. Try Play again or open the full game.";
  }

  exit() {
    clearTimeout(this.loadTimer);
    if (!this.frame) return;
    window.removeEventListener("message", this._onMessage);
    document.removeEventListener("pointerdown", this._onOutsidePointer, true);
    document.removeEventListener("keydown", this._onKey);
    this.card.removeEventListener("wheel", swallowWheel);
    this.frame.remove();
    this.frame = null;
    this._setState("preview");
    this.playButton?.focus({ preventScroll: true });
  }

  /** Called by the carousel. A card that leaves the centre leaves the game too. */
  setCentered(centered) {
    if (centered === this.centered) return;
    this.centered = centered;
    if (!centered) this.exit();
    this.frame?.contentWindow?.postMessage(
      { type: ACTIVE, active: centered },
      window.location.origin,
    );
  }

  /* ---------------------------------------------------------------- */

  _setState(state) {
    this.state = state;
    this.card.dataset.state = state;
    this.card.classList.toggle("is-live", state === "playing");
    this.card.classList.toggle("is-loading", state === "loading");

    if (state === "loading") {
      this.status.textContent = "Loading the game…";
      this.playButton.setAttribute("aria-busy", "true");
    } else if (state === "playing") {
      this.status.textContent = "";
      this.playButton.removeAttribute("aria-busy");
      clearTimeout(this.loadTimer);
      this.frame?.focus();
    } else {
      this.status.textContent = "";
      this.playButton?.removeAttribute("aria-busy");
    }
    this.hooks.onStateChange?.(state, this);
  }

  dispose() {
    this.exit();
  }
}
