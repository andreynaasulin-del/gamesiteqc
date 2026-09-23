import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInput } from '../src/strike/engine/input.ts';

function fixture(t) {
  globalThis.Element = class extends EventTarget { matches() { return false; } };
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  const timers = new Map(); let timer = 0;
  window.setTimeout = fn => { timers.set(++timer, fn); return timer; };
  window.clearTimeout = id => timers.delete(id);
  const canvas = new Element();
  document.pointerLockElement = null;
  const lock = value => {
    document.pointerLockElement = value ? canvas : null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  document.exitPointerLock = () => lock(false);
  canvas.requestPointerLock = () => lock(true);
  const input = createInput(canvas);
  t.after(() => input.dispose());
  const send = (target, type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props); target.dispatchEvent(event); return event;
  };
  return { input, canvas, lock, timers, send,
    key: (code, type = 'keydown', repeat = false) => send(document, type, { code, repeat }) };
}

test('unlocked controls do not move/fire or steal Tab from menus', t => {
  const f = fixture(t);
  f.key('KeyW'); f.send(window, 'mousedown', { button: 0 });
  assert.equal(f.input.move.forward, 0); assert.equal(f.input.fire, false);
  assert.equal(f.key('Tab', 'keyup').defaultPrevented, false);
});

test('locked WASD, arrows, jump, crouch, walk and scoreboard use real handlers', t => {
  const f = fixture(t); f.input.requestLock();
  for (const [code, property, value] of [['KeyW','forward',1],['KeyS','forward',-1],['KeyA','right',-1],['KeyD','right',1],['ArrowUp','forward',1],['Space','jump',true],['ControlLeft','crouch',true],['KeyC','crouch',true],['ShiftRight','walk',true]]) {
    const e = f.key(code); assert.equal(f.input.move[property], value, code);
    if (code === 'Space' || code === 'ArrowUp') assert.equal(e.defaultPrevented, true);
    f.key(code, 'keyup'); assert.ok(!f.input.move[property]);
  }
  assert.equal(f.key('Tab').defaultPrevented, true); assert.equal(f.input.scoreboard, true);
  f.key('Tab','keyup'); assert.equal(f.input.scoreboard, false);
});

test('A movement survives browsers that omit the physical key code', t => {
  const f = fixture(t); f.lock(true);
  f.send(document, 'keydown', { code: 'Unidentified', key: 'a' });
  assert.equal(f.input.move.right, -1, 'A must move left when only event.key is available');
  f.send(document, 'keyup', { code: 'Unidentified', key: 'a' });
  assert.equal(f.input.move.right, 0, 'fallback keyup must release the same movement');
});

test('mouse aim/fire and reload/interact/weapon edges are consumed once', t => {
  const f = fixture(t); f.lock(true);
  f.send(document,'mousemove',{movementX:12,movementY:-5});
  assert.deepEqual({...f.input.consumeLook()},{dx:12,dy:-5});
  assert.deepEqual({...f.input.consumeLook()},{dx:0,dy:0});
  f.send(window,'mousedown',{button:0}); assert.equal(f.input.fire,true);
  f.send(window,'mouseup',{button:0}); assert.equal(f.input.fire,false);
  f.key('KeyR'); f.key('KeyE'); f.key('Digit2');
  assert.equal(f.input.reload,true); assert.equal(f.input.interact,true); assert.equal(f.input.weaponSlot,2);
  f.input.update(); f.key('KeyR','keydown',true);
  assert.equal(f.input.reload,false); assert.equal(f.input.interact,false); assert.equal(f.input.weaponSlot,0);
  f.send(window,'wheel',{deltaY:120,deltaMode:0}); assert.equal(f.input.weaponSlot,3);
});

test('blur, Escape and P release clear held controls and wheel residue', t => {
  const f = fixture(t); f.lock(true);
  f.key('KeyW'); f.send(window,'mousedown',{button:0});
  f.send(window,'wheel',{deltaY:20,deltaMode:0}); f.send(window,'blur');
  assert.equal(f.input.move.forward,0); assert.equal(f.input.fire,false);
  f.send(window,'wheel',{deltaY:20,deltaMode:0}); assert.equal(f.input.weaponSlot,0);
  f.key('KeyP'); assert.equal(f.input.locked,false); assert.equal(f.input.pointerReleased,true);
  f.key('KeyP'); assert.equal(f.input.locked,true);
  f.key('Escape'); assert.equal(f.input.locked,false); assert.equal(f.input.pointerReleased,false);
});

test('sync refusal and missing API report recoverable failure, then retry succeeds', t => {
  const f = fixture(t); const errors=[]; f.input.onLockError(e=>errors.push(e));
  f.canvas.requestPointerLock = () => { throw new Error('denied'); };
  assert.doesNotThrow(()=>f.input.requestLock()); assert.equal(errors.length,1);
  f.canvas.requestPointerLock = undefined; f.input.requestLock(); assert.equal(errors.length,2);
  f.canvas.requestPointerLock = () => f.lock(true); f.input.requestLock(); assert.equal(f.input.locked,true);
});

test('pending requests deduplicate; event plus promise refusal reports once', async t => {
  const f = fixture(t); let calls=0, reject; const errors=[];
  f.input.onLockError(e=>errors.push(e));
  f.canvas.requestPointerLock = () => { calls++; return new Promise((_,r)=>{ reject=r; }); };
  f.input.requestLock(); f.input.requestLock(); assert.equal(calls,1);
  f.send(document,'pointerlockerror'); reject(new Error('denied')); await Promise.resolve();
  assert.equal(errors.length,1); assert.equal(f.timers.size,0);
  f.canvas.requestPointerLock = () => f.lock(true); f.input.requestLock();
  assert.equal(f.input.locked,true);
});

test('no browser response times out, and stale rejection cannot cancel a newer capture', async t => {
  const f=fixture(t); const errors=[]; let reject;
  f.input.onLockError(e=>errors.push(e));
  f.canvas.requestPointerLock=()=>new Promise((_,r)=>{reject=r;}); f.input.requestLock();
  [...f.timers.values()][0](); assert.equal(errors.length,1);
  f.canvas.requestPointerLock=()=>f.lock(true); f.input.requestLock();
  reject(new Error('old')); await Promise.resolve();
  assert.equal(f.input.locked,true); assert.equal(errors.length,1);
});

test('dispose removes handlers, timer and lock; late promises cannot call UI', async t => {
  const f=fixture(t); let reject, errors=0;
  f.input.onLockError(()=>errors++);
  f.canvas.requestPointerLock=()=>new Promise((_,r)=>{reject=r;});
  f.input.requestLock(); f.input.dispose(); reject(new Error('late')); await Promise.resolve();
  assert.equal(errors,0); assert.equal(f.timers.size,0);
  f.lock(true); f.key('KeyW'); assert.equal(f.input.move.forward,0);
});

test('launch wiring starts the match with or without capture; every match ignores saved sound opt-in', () => {
  const game=readFileSync(new URL('../src/strike/game/game.ts',import.meta.url),'utf8');
  const overlays=readFileSync(new URL('../src/strike/game/overlays.ts',import.meta.url),'utf8');
  assert.match(game,/let muted = true/); assert.match(game,/rawAudio\.setMuted\(true\)/);
  assert.doesNotMatch(game,/readSoundPref|writeSoundPref|ps\.sound/);
  assert.match(game,/onResume: \(\) => requestLockSoon\(\)/);
  const click=overlays.split("resume.addEventListener('click', () => {")[1].split('})')[0];
  assert.doesNotMatch(click,/menu\.close/); assert.match(click,/opts\.onResume/);
  // Launching must not depend on the capture: the menu closes on the way out, the fallback
  // takes over when nothing answers, and a refusal is a control scheme rather than a dialog.
  const launch=game.split('function requestLockSoon(reason: \'team-pick\' | \'resume\' = \'resume\'): void {')[1].split('\n  }')[0];
  assert.match(launch,/menu\.close\(\)/); assert.match(launch,/input\.requestLock\(\)/); assert.match(launch,/input\.engage\(\)/);
  const lockError=game.split('input.onLockError((message) => {')[1].split('})')[0];
  assert.doesNotMatch(lockError,/menu\.open/); assert.match(lockError,/setPointerReleased\(true, message\)/);
  // Picking a side enters the match instead of handing the player back to the menu.
  const closeTeam=game.split('function closeTeamScreen(): void {')[1].split('\n  }')[0];
  assert.match(closeTeam,/requestLockSoon\(/); assert.doesNotMatch(closeTeam,/menu\.open/);
  // The pause row is a score, not a capacity: "3/3" reads as a full room to a player in it.
  const row=overlays.split('const renderTeams = () => {')[1].split('\n  }')[0];
  assert.match(row,/\} v \$\{/); assert.doesNotMatch(row,/\}\/\$\{MATCH\.teamSize\}/);
});

/** Refuse the capture the way a hostile browser does: reject the request, then run the timer. */
function refuseCapture(f) {
  f.canvas.requestPointerLock = () => { throw new Error('The root document of this element is not valid for pointer lock.'); };
  f.input.requestLock();
}

/**
 * A mouse event that really carries the canvas as its target, dispatched where input listens:
 * buttons on the window, movement on the document (there is no DOM tree here to bubble one).
 */
function mouse(f, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, props);
  Object.defineProperty(event, 'target', { value: f.canvas });
  (type === 'mousemove' ? document : window).dispatchEvent(event);
  return event;
}

test('a refused capture falls back to drag-look instead of a dead menu', t => {
  const f = fixture(t); const errors = [];
  f.input.onLockError(message => errors.push(message));
  refuseCapture(f);
  assert.equal(f.input.engaged, true, 'refusal engages the fallback');
  assert.match(errors[0] ?? '', /drag to aim/);
  // Keyboard is live without any capture at all.
  f.key('KeyW'); assert.equal(f.input.move.forward, 1);
  assert.equal(f.key('Tab').defaultPrevented, true); assert.equal(f.input.scoreboard, true);
  f.key('Tab', 'keyup'); f.key('KeyW', 'keyup');
  // A drag on the canvas aims; the deltas are measured from the previous position.
  mouse(f, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
  assert.equal(f.input.fire, false, 'the right button aims without shooting');
  mouse(f, 'mousemove', { clientX: 110, clientY: 95 });
  assert.deepEqual({ ...f.input.consumeLook() }, { dx: 16, dy: -8 });
  mouse(f, 'mouseup', { button: 2 });
  mouse(f, 'mousemove', { clientX: 200, clientY: 200 });
  assert.deepEqual({ ...f.input.consumeLook() }, { dx: 0, dy: 0 }, 'a released drag does not aim');
  // Left click shoots.
  mouse(f, 'mousedown', { button: 0, clientX: 200, clientY: 200 });
  assert.equal(f.input.fire, true);
  mouse(f, 'mouseup', { button: 0 }); assert.equal(f.input.fire, false);
});

test('drag-look yields to a real capture and to Escape', t => {
  const f = fixture(t);
  refuseCapture(f);
  assert.equal(f.input.engaged, true);
  // Escape has no capture to release here: it leaves the fallback and lets the game's own
  // handler (registered after input's) open the menu.
  const seen = [];
  document.addEventListener('keydown', event => seen.push(event.code));
  const escape = f.key('Escape');
  assert.equal(f.input.engaged, false); assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(seen, ['Escape'], 'the menu key is not swallowed');
  f.key('KeyW'); assert.equal(f.input.move.forward, 0, 'paused means paused');
  // A capture that does arrive supersedes the fallback: one look source at a time.
  refuseCapture(f); assert.equal(f.input.engaged, true);
  f.lock(true);
  assert.equal(f.input.engaged, false); assert.equal(f.input.locked, true);
  mouse(f, 'mousemove', { clientX: 300, clientY: 300, movementX: 4, movementY: 2 });
  assert.deepEqual({ ...f.input.consumeLook() }, { dx: 4, dy: 2 }, 'locked movement only');
});
