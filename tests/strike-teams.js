import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// The host pulls in half the game by bundler-style specifiers (`'../config'`), so the hook has
// to be in place before the first of them is imported — hence the dynamic imports below.
register(new URL('./ts-resolve.mjs', import.meta.url));
const { startHostAuthority } = await import('../src/strike/net/host.ts');
const { createLocalRoom } = await import('../src/strike/net/local-room.ts');
const { MATCH } = await import('../src/strike/config.ts');
const { PS } = await import('../src/strike/net/protocol.ts');

/**
 * The host authority against the offline room, with the 20 Hz tick driven by hand.
 * Only `window`'s timers are stubbed: everything the bot fill decides is real code.
 */
function fixture(t, options = {}) {
  const ticks = [];
  let id = 0;
  globalThis.window = {
    setInterval: (fn) => { ticks.push(fn); return ++id; },
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  let now = 0;
  const room = createLocalRoom({ name: 'You', botsFill: options.botsFill ?? true });
  const registry = { get: () => undefined, list: () => [], size: 0, local: null };
  const events = { emit: () => {}, on: () => () => {} };
  const host = startHostAuthority(room, registry, () => null, events, { now: () => now });
  t.after(() => { host.stop(); room.leave(); });

  /** Run whole balance windows (BALANCE_MS = 500) and let `addBot`'s promises land. */
  const settle = async (windows = 6) => {
    for (let i = 0; i < windows; i++) {
      now += 600;
      for (const tick of ticks) tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const seats = () => {
    const out = { a: 0, b: 0, bots: 0, choosing: 0 };
    for (const p of room.players()) {
      const team = p.getState(PS.team);
      if (p.isBot()) out.bots++;
      else if (!team) out.choosing++;
      if (team === 'a' || team === 'b') out[team]++;
    }
    return out;
  };
  return { room, host, settle, seats };
}

test('a player on the team screen keeps a free slot on BOTH sides', async (t) => {
  const f = fixture(t);
  await f.settle();
  const s = f.seats();
  assert.equal(s.choosing, 1, 'the human is still choosing');
  // The bug: five bots fit around the chooser and packed one side to 3/3, so half the
  // team screen answered a click with "full".
  assert.ok(s.a < MATCH.teamSize, `team a left room: ${s.a}/${MATCH.teamSize}`);
  assert.ok(s.b < MATCH.teamSize, `team b left room: ${s.b}/${MATCH.teamSize}`);
  assert.deepEqual([s.a, s.b, s.bots], [MATCH.teamSize - 1, MATCH.teamSize - 1, 4]);
});

test('the held slot does not churn: no bot is added just to be kicked', async (t) => {
  const f = fixture(t);
  await f.settle();
  const before = f.room.players().map((p) => p.id).join();
  await f.settle(10);
  assert.equal(f.room.players().map((p) => p.id).join(), before, 'roster kept flipping');
});

test('picking a side is accepted and the room fills to 3v3 around the player', async (t) => {
  const f = fixture(t);
  await f.settle();
  const result = f.host.requestTeam('me', 'a');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.assigned, 'a');
  await f.settle();
  const s = f.seats();
  assert.deepEqual([s.a, s.b, s.choosing], [MATCH.teamSize, MATCH.teamSize, 0]);
  assert.equal(f.room.players().length, MATCH.maxPlayers);
});

test('auto seats a chooser too, and the second pick swaps sides on a full room', async (t) => {
  const f = fixture(t);
  await f.settle();
  assert.equal(f.host.requestTeam('me', 'auto').ok, true);
  await f.settle();
  const swap = f.host.requestTeam('me', 'b');
  assert.equal(swap.ok, true, swap.reason);
  await f.settle();
  const s = f.seats();
  assert.deepEqual([s.a, s.b], [MATCH.teamSize, MATCH.teamSize]);
  assert.equal(f.room.players().find((p) => p.id === 'me').getState(PS.team), 'b');
});

test('bots off leaves the room empty and still lets the player in', async (t) => {
  const f = fixture(t, { botsFill: false });
  await f.settle();
  assert.equal(f.seats().bots, 0);
  assert.equal(f.host.requestTeam('me', 'a').ok, true);
  await f.settle();
  assert.deepEqual([f.seats().a, f.seats().b], [1, 0]);
});

test('the team screen says a bot will step aside instead of reading as full', () => {
  const overlays = readFileSync(new URL('../src/strike/game/overlays.ts', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../src/strike/net/host.ts', import.meta.url), 'utf8');
  assert.match(overlays, /A bot steps aside/);
  assert.match(overlays, /is-full', free <= 0 && bots === 0/);
  // The fill must ask for the capped seat count in both places it seats a bot.
  assert.equal((host.match(/botSeatsPerTeam\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(host, /if \(counts\[team\] >= MATCH\.teamSize\) \{\n        \/\/ Its side is full/);
});
