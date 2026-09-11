/**
 * Boot for Paint Strike: click Play, be shooting.
 *
 * This is a landing card, not a game portal. The visitor already clicked Play once, on the
 * page — making them pick a name, a character and a room before the first shot is how you
 * lose them. So boot goes straight into a local match against bots, and every setting a
 * menu would have asked for is a default or a query flag:
 *   ?map=corridors|iceyard   (default: the fastest one to load)
 *   ?bots=0                  play the map alone
 *   ?embed                   running inside the hero card
 *   ?fps                     FPS readout in the HUD
 *   ?debug=1                 in-game debug panel (FPS, backend, entities)
 * Dev entries: ?dev=map|ui|characters|weapons, ?sandbox=1.
 */
import './ui/styles.css'
import { EMBED, EmbedPresence } from '../core/Embed.js'
import { DEFAULT_CHARACTERS, defaultCharacter } from './characters/catalog'
import { loadCharacterAsset } from './characters/assets'
import { preloadWeaponAssets } from './weapons/weapon-assets'
import { BUILTIN_MAPS } from './config'
import { appRoot, el } from './ui/dom'
import { isTouchOnly, showUnsupported } from './ui/unsupported'
import { createLocalRoom } from './net/local-room'
import type { MapSelection } from './types'

const params = new URLSearchParams(location.search)

function notifyHost(type: string) {
  if (EMBED && window.parent !== window) window.parent.postMessage({ type }, location.origin)
}
// Escape is not an exit here: in a shooter it is the pause key, and kicking a player out of
// the match mid-round because they let go of the mouse is the fastest way to make the card
// feel broken. The pause menu's last button hands the page back instead.

/**
 * Corridors first: 648 KB against several megabytes for the open maps. On a landing the first
 * frame is the whole pitch, and eight seconds of loading bar is a bounce. The bigger map is
 * one query flag away for anyone who came to look around.
 */
const DEFAULT_MAP_ID = 'corridors'

async function boot(): Promise<void> {
  if (params.get('dev') === 'weapons') return (await import('./dev/weapons')).start()
  if (params.get('dev') === 'characters') return (await import('./dev/characters')).start()
  if (params.get('dev') === 'map') return (await import('./dev/map-viewer')).start()
  if (params.get('sandbox') === '1') return (await import('./dev/sandbox')).start()
  if (params.get('dev') === 'ui') return (await import('./dev/ui-showcase')).start()

  if (isTouchOnly()) {
    showUnsupported('mobile')
    notifyHost('qc:error')
    return
  }
  if (!hasGpu()) {
    showUnsupported('gpu')
    notifyHost('qc:error')
    return
  }
  await play()
}

async function play(): Promise<void> {
  const mount = appRoot()
  const { RendererInitError } = await import('./engine/renderer')
  const map = pickMap()
  const character = defaultCharacter(String(Math.random()))

  try {
    // Weapons and the four stock bodies are needed within seconds of spawn; pulling them now
    // means the loading bar covers the wait instead of a bot popping in half-dressed.
    await Promise.all([preloadWeaponAssets(), ...DEFAULT_CHARACTERS.map(loadCharacterAsset)])

    const room = createLocalRoom({
      name: 'You',
      character,
      map,
      botsFill: params.get('bots') !== '0',
    })

    const { startGame } = await import('./game/game')
    const presence = new EmbedPresence(mount)
    const game = await startGame({
      room,
      map,
      botsFill: params.get('bots') !== '0',
      mount,
      onExit: () => presence.requestExit(),
    })

    game.engine.isSuspended = () => presence.suspended
    window.addEventListener('pagehide', () => {
      presence.dispose()
      game.dispose()
      room.leave()
    }, { once: true })
    if (params.has('fps') || params.get('debug') === '1') {
      Object.assign(window, { strikeGame: game })
    }
    presence.announceReady()
  } catch (err) {
    if (err instanceof RendererInitError) {
      showUnsupported('gpu')
      notifyHost('qc:error')
      return
    }
    throw err
  }
}

function pickMap(): MapSelection {
  const wanted = params.get('map')
  const found = BUILTIN_MAPS.find((m) => m.id === wanted) ?? BUILTIN_MAPS.find((m) => m.id === DEFAULT_MAP_ID)
  const map = found ?? BUILTIN_MAPS[0]
  return { id: map.id, name: map.name, url: map.url }
}

/** WebGPU, or the WebGL2 fallback the renderer would pick. */
function hasGpu(): boolean {
  if ('gpu' in navigator) return true
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

boot().catch((err) => {
  notifyHost('qc:error')
  console.error(err)
  const app = document.getElementById('app')
  if (app) {
    app.appendChild(
      el('div', {
        style: 'padding:2rem;font:14px Inter,system-ui;color:#fafafa',
        text: `Boot failed: ${err?.message ?? err}`,
      }),
    )
  }
})
