import './ui/style.css';
import { Game } from './core/Game';
import { EMBED, EmbedPresence } from '../core/Embed.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

/** `?fps` — a QA overlay, not a feature. Tier, rate and worst frame. */
function attachFpsReadout(game: Game) {
  if (!new URLSearchParams(location.search).has('fps')) return;

  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:10px;top:10px;z-index:50;padding:4px 8px;border-radius:6px;' +
    'background:rgba(0,0,0,.6);color:#8fd4ff;font:11px/1.4 ui-monospace,monospace;pointer-events:none';
  document.body.appendChild(box);

  let worst = 0;
  let since = 0;
  game.fpsReadout = (interval: number) => {
    if (interval < 400 && interval > worst) worst = interval;
    since += interval;
    if (since < 250) return;
    since = 0;
    const q = game.quality;
    box.textContent =
      `${Math.round(1000 / q.frameMs)} fps · ${q.frameMs.toFixed(1)} ms · worst ${worst.toFixed(0)} ms · ` +
      `${q.tier.id} · pr ${game.renderer.getPixelRatio().toFixed(2)}`;
    worst = 0;
  };
}

async function boot() {
  try {
    const game = await Game.create(canvas, ui);

    // Embedded in the landing's hero card: stop rendering while the card is
    // off-screen or is not the selected slot, and tell the host when the
    // arena is up so it can drop the poster.
    const presence = new EmbedPresence(canvas);
    if (EMBED) {
      // Esc gives the page back instead of opening the pause menu; the card's
      // Exit chip and the other game on the landing both promise that.
      game.setExitRequest(() => presence.requestExit());
      const composer = game.composer;
      const render = composer.render.bind(composer);
      composer.render = ((delta?: number) => {
        if (presence.suspended) return;
        render(delta);
      }) as typeof composer.render;
    }

    attachFpsReadout(game);
    game.start();
    // Expose for tuning from the console.
    (window as unknown as { game: Game }).game = game;

    presence.announceReady();
    loading.style.opacity = '0';
    setTimeout(() => loading.remove(), 500);
    canvas.focus();
  } catch (err) {
    console.error(err);
    loading.innerHTML = `<div style="text-align:center;max-width:520px;letter-spacing:1px">
      <div style="color:#ff6b6b;margin-bottom:10px">Failed to start</div>
      <div style="opacity:.7;font-size:11px;text-transform:none">${String(err)}</div>
    </div>`;
  }
}

boot();
