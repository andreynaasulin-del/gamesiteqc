/**
 * Where this game's files live on our site.
 *
 * The full build ships as a site of its own, so it loads `/maps/...`, `/sfx/...` and friends from
 * the domain root. Here it is one page among several: the files sit under `public/strike/`,
 * and the landing can be served from a sub-path, so every URL has to start from Vite's
 * configured base rather than `/`.
 */
// `import.meta.env` is inlined by the bundler; outside it (the Node tests import the config
// this file feeds) there is no env at all, and a root base is the right answer.
const CONFIGURED: string = import.meta.env?.BASE_URL ?? '/'
const BASE = CONFIGURED.endsWith('/') ? CONFIGURED : `${CONFIGURED}/`

/** `assetUrl('maps/corridors.glb')` → `<base>strike/maps/corridors.glb`. */
export function assetUrl(path: string): string {
  return `${BASE}strike/${path.replace(/^\/+/, '')}`
}
