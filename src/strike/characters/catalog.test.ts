// @ts-ignore Bun provides the test runtime.
import { expect, test } from 'bun:test'
import { DEFAULT_CHARACTERS, defaultCharacter, parseCharacter } from './catalog'

test('nothing but a bundled character can enter game state', () => {
  expect(parseCharacter({ id: 'nova' })).toBe(DEFAULT_CHARACTERS[3])
  for (const value of [null, [], 'ace', { id: 'abc123', manifestUrl: 'https://example.com/model.json' }, { id: '../ace' }, { id: {} }]) {
    expect(parseCharacter(value)).toBeNull()
  }
})

test('a remote cannot replace a bundled preset URL and defaults are deterministic', () => {
  expect(new Set(DEFAULT_CHARACTERS.map(c => c.id)).size).toBe(4)
  expect(parseCharacter({ id: 'ace', manifestUrl: 'https://example.com/model' })).toBe(DEFAULT_CHARACTERS[0])
  const assignments = ['a', 'b', 'c', 'd'].map(defaultCharacter)
  expect(new Set(assignments.map(c => c.id)).size).toBe(4)
  expect(defaultCharacter('migrating-bot')).toEqual(defaultCharacter('migrating-bot'))
})
