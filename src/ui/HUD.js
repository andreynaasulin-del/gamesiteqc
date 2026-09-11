import { ELEMENTS, ELEMENT_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';

const QUADCODE_URL = 'https://quadcode.ai/';
const DOWNLOAD_URL = 'https://quadcode.ai/#download';
const SOURCE_URL = 'https://github.com/achrefelouafi/LinearAbiltyCastingExtendedThreeJS';

/**
 * Heads-up display for the Quadcode short edition.
 *
 * Plain DOM — no framework. Four things on screen and nothing else: the brand
 * header, one CTA, the six ability cards, and a help panel you can hide.
 * An onboarding card plays once after the loading veil lifts and gets out of
 * the way on the first key or click.
 *
 * The cooldown sweep is a `conic-gradient` driven by a CSS custom property, so
 * updating it every frame is one `setProperty` call and never touches layout.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onAbility = null;
    this._toastTimer = 0;
    /** Last sweep ratio pushed to the DOM, per element. */
    this._cooldownShown = new Map();
    this._armedShown = null;
    this._onboarded = false;

    const keys = ELEMENTS.map((element) => ELEMENT_META[element].key);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const steps = touch
      ? [
          `<i class="onboard__tap"></i><span>Tap a card below</span>`,
          `<i class="onboard__tap onboard__tap--hot"></i><span>Tap the floor — it fires there</span>`,
          `<i class="onboard__tap onboard__tap--two"></i><span>Two‑finger drag to orbit</span>`
        ]
      : [
          `<kbd>${keys.join('</kbd><kbd>')}</kbd><span>Pick a cast</span>`,
          `<i class="onboard__mouse"></i><span>Aim with the mouse</span>`,
          `<i class="onboard__click"></i><span>Click to fire</span>`
        ];
    const hint = touch ? 'Hit the blue targets.' : 'Hit the blue targets. Right‑drag to orbit.';

    root.innerHTML = `
      <header class="hud__brand">
        <a class="hud__logo" href="${QUADCODE_URL}" target="_blank" rel="noopener" aria-label="Quadcode">
          <img src="./brand/quadcode-logo.png" alt="Quadcode" width="132" height="28" />
        </a>
        <span class="hud__brand-tag">Games playground</span>
      </header>

      <a class="hud__cta" href="${DOWNLOAD_URL}" target="_blank" rel="noopener">
        Get Quadcode
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>

      <div class="hud__panel hud__help">
        <div class="hud__help-row"><kbd>${keys.join('</kbd><kbd>')}</kbd> pick a cast</div>
        <div class="hud__help-row"><strong>Move</strong> aim · <strong>Click</strong> cast</div>
        <div class="hud__help-row"><strong>Esc</strong> cancel · <strong>Right‑drag</strong> orbit · <strong>Scroll</strong> zoom</div>
        <div class="hud__help-row hud__help-row--dim"><kbd>C</kbd> clear <kbd>T</kbd> reset targets <kbd>H</kbd> hide this</div>
      </div>

      <div class="hud__abilities" role="toolbar" aria-label="Abilities">
        ${ELEMENTS.map((element) => {
          const meta = ELEMENT_META[element];
          return `
            <button class="ability-card" type="button" data-element="${element}" style="--accent:${meta.accent}" title="${meta.blurb}">
              <span class="ability-card__sweep" data-sweep></span>
              <span class="ability-card__key">${meta.key}</span>
              <span class="ability-card__glyph">${ELEMENT_SIGILS[element] ?? ''}</span>
              <span class="ability-card__label">${meta.label}</span>
            </button>`;
        }).join('')}
      </div>

      <a class="hud__credit" href="${SOURCE_URL}" target="_blank" rel="noopener">
        Built on Elemental Sandbox · MIT
      </a>

      <div class="hud__onboard" data-onboard hidden>
        <div class="onboard">
          <img class="onboard__mark" src="./brand/quadcode-mark.svg" alt="" width="40" height="40" />
          <h2 class="onboard__title">Six casts.<br> One character.<br> Go.</h2>
          <ol class="onboard__steps">
            <li>${steps.join('</li><li>')}</li>
          </ol>
          <button class="onboard__go" type="button" data-onboard-go>Start casting</button>
          <p class="onboard__hint">${hint}</p>
        </div>
      </div>

      <div class="hud__toast" data-toast></div>
      <div class="hud__paused" data-paused>Paused</div>
    `;

    this.cards = new Map();
    for (const card of root.querySelectorAll('.ability-card')) {
      this.cards.set(card.dataset.element, card);
      card.setAttribute('aria-label', ELEMENT_META[card.dataset.element].label);
      card.addEventListener('pointerdown', (event) => event.stopPropagation());
      // Native click supports touch, mouse and Enter/Space without double casts.
      card.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dismissOnboarding();
        this.onAbility?.(card.dataset.element);
      });
    }

    this.help = root.querySelector('.hud__help');
    this.toast = root.querySelector('[data-toast]');
    this.pausedBadge = root.querySelector('[data-paused]');
    this.abilityBar = root.querySelector('.hud__abilities');
    this.onboard = root.querySelector('[data-onboard]');

    root.querySelector('[data-onboard-go]').addEventListener('click', () => this.dismissOnboarding());
    this.onboard.addEventListener('pointerdown', (event) => {
      if (event.target === this.onboard) this.dismissOnboarding();
    });
    this._onFirstKey = (event) => {
      if (event.key === 'Tab') return;
      this.dismissOnboarding();
    };
  }

  /** @param {{silent?: boolean}} [options] */
  setElement(element, options = {}) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
      card.setAttribute('aria-pressed', String(key === element));
    }
    const meta = ELEMENT_META[element];
    if (meta) this.root.style.setProperty('--hud-accent', meta.accent);
    if (meta && !options.silent) this.showToast(meta.hint);
  }

  /** Highlight the slot while a cast is armed. */
  setArmed(armed) {
    if (armed === this._armedShown) return;
    this._armedShown = armed;
    this.abilityBar.classList.toggle('is-armed', armed);
  }

  /**
   * Drive one slot's cooldown sweep. Cooldowns are per ability, so this is
   * called once per element each frame.
   */
  setCooldown(element, remaining, total) {
    const card = this.cards.get(element);
    if (!card) return;

    const ratio = Math.max(0, Math.min(1, remaining / Math.max(total, 0.001)));
    if (Math.abs(ratio - (this._cooldownShown.get(element) ?? -1)) < 0.01) return;
    this._cooldownShown.set(element, ratio);
    card.style.setProperty('--cooldown', ratio);
    card.classList.toggle('is-cooling', ratio > 0.001);
  }

  /** Called once the loading veil is clearing: fade the HUD in, show onboarding. */
  reveal() {
    this.root.classList.add('is-ready', 'is-onboarding');
    this.onboard.hidden = false;
    requestAnimationFrame(() => this.onboard.classList.add('is-visible'));
    window.addEventListener('keydown', this._onFirstKey);
  }

  dismissOnboarding() {
    if (this._onboarded) return;
    this._onboarded = true;
    window.removeEventListener('keydown', this._onFirstKey);
    this.root.classList.remove('is-onboarding');
    this.onboard.classList.remove('is-visible');
    setTimeout(() => (this.onboard.hidden = true), 320);
  }

  setPaused(paused) {
    this.pausedBadge.classList.toggle('is-visible', paused);
  }

  toggleHelp() {
    this.help.classList.toggle('is-hidden');
  }

  showToast(message, duration = 1600) {
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('is-visible'), duration);
  }

  /**
   * Opt-in readout (`?fps` in the URL): smoothed FPS and the active quality
   * tier, refreshed four times a second. Off by default — visitors never see it.
   */
  update(frameMs, tierId) {
    if (!this._meter) {
      if (!new URLSearchParams(window.location.search).has('fps')) { this.update = () => {}; return; }
      this._meter = document.createElement('div');
      this._meter.className = 'hud__meter';
      this._meterAt = 0;
      this.root.appendChild(this._meter);
    }
    const now = performance.now();
    if (now - this._meterAt < 250) return;
    this._meterAt = now;
    this._meter.textContent = `${Math.round(1000 / Math.max(frameMs, 1))} fps · ${frameMs.toFixed(1)} ms · ${tierId}`;
  }
}

/** Boot screen helper. */
export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  }

  setProgress(ratio, message) {
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    if (message) this.status.textContent = message;
  }

  hide() {
    this.setProgress(1);
    setTimeout(() => this.element.classList.add('is-hidden'), 220);
  }

  fail(message) {
    this.status.textContent = message;
    this.status.style.color = '#ff9569';
  }
}
