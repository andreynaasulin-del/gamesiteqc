import { assetUrl } from '../asset-url'
import type { CharacterSelection } from '../types'

/** Every playable character ships with the game; nothing is fetched from anywhere else. */
export const DEFAULT_CHARACTERS: CharacterSelection[] = [
  { id: 'ace', name: 'Ace', gender: 'man', manifestUrl: assetUrl('characters/ace.manifest.json') },
  { id: 'brian', name: 'Brian', gender: 'man', manifestUrl: assetUrl('characters/brian.manifest.json') },
  { id: 'janette', name: 'Janette', gender: 'woman', manifestUrl: assetUrl('characters/janette.manifest.json') },
  { id: 'nova', name: 'Nova', gender: 'woman', manifestUrl: assetUrl('characters/nova.manifest.json') },
]

export function defaultCharacter(seed = ''): CharacterSelection {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return DEFAULT_CHARACTERS[hash % DEFAULT_CHARACTERS.length]
}

/** Only bundled characters are accepted, wherever the value came from. */
export function parseCharacter(value: unknown): CharacterSelection | null {
  if (!value || typeof value !== 'object') return null
  const { id } = value as Record<string, unknown>
  return DEFAULT_CHARACTERS.find(preset => preset.id === id) ?? null
}

export function readCharacter(): CharacterSelection {
  try { return parseCharacter(JSON.parse(localStorage.getItem('ps.character') || 'null')) ?? DEFAULT_CHARACTERS[0] }
  catch { return DEFAULT_CHARACTERS[0] }
}

export function saveCharacter(character: CharacterSelection): void {
  try { localStorage.setItem('ps.character', JSON.stringify(character)) } catch { /* Selection still works without storage. */ }
}
