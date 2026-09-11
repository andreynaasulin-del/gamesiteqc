import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCard } from '../src/landing/hero-game.js';
import { createGraphics, graphicsPixelRatio } from '../src/strike/engine/graphics.ts';

class Node extends EventTarget {
  dataset = { position: 'center' };
  classList = { add() {}, toggle() {} };
  attrs = {};
  contentWindow = {};
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { this.child = n; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  contains(n) { return n === this; }
}
function fixture() {
  globalThis.location = new URL('http://localhost/?fps');
  globalThis.window = new EventTarget();
  window.location = location;
  window.matchMedia = () => ({ matches: true });
  globalThis.document = new EventTarget();
  document.createElement = () => new Node();
  const nodes = new Map();
  const card = new Node();
  card.querySelector = (s) => {
    if (!nodes.has(s)) nodes.set(s, new Node());
    return nodes.get(s);
  };
  return new GameCard(card, { status: 'live', title: 'Strike', embed: 'strike.html' });
}
function message(g, type, source = g.frame.contentWindow, origin = location.origin) {
  g._onMessage({ data: { type }, source, origin });
}

test('loading can be cancelled immediately by Escape', () => {
  const g = fixture();
  try {
    g.play();
    assert.equal(g.state, 'loading');
    const e = new Event('keydown'); Object.assign(e, { key: 'Escape' });
    document.dispatchEvent(e);
    assert.equal(g.state, 'preview');
    assert.equal(g.frame, null);
  } finally { g.dispose(); }
});
test('ready / exit / replay mounts a fresh iframe and forwards FPS', () => {
  const g = fixture();
  try {
    g.play(); const old = g.frame;
    assert.match(old.src, /embed=/);
    assert.match(old.src, /fps=/);
    assert.doesNotMatch(old.attrs.allow, /pointer-lock/);
    message(g, 'qc:ready'); assert.equal(g.state, 'playing');
    message(g, 'qc:exit'); assert.equal(g.state, 'preview');
    assert.equal(old.removed, true);
    g.play(); assert.notEqual(g.frame, old);
    message(g, 'qc:ready', old.contentWindow); assert.equal(g.state, 'loading');
  } finally { g.dispose(); }
});
test('foreign origins cannot announce ready', () => {
  const g = fixture();
  try {
    g.play(); message(g, 'qc:ready', g.frame.contentWindow, 'https://other.test');
    assert.equal(g.state, 'loading');
  } finally { g.dispose(); }
});
test('load error returns retryable preview and cleans up iframe', () => {
  const g = fixture();
  try {
    g.play(); message(g, 'qc:error');
    assert.equal(g.frame, null); assert.match(g.status.textContent, /could not start/);
    g.play(); assert.equal(g.state, 'loading');
  } finally { g.dispose(); }
});
test('outside pointer and slot change both cancel loading', () => {
  const g = fixture();
  try {
    g.play(); document.dispatchEvent(new Event('pointerdown'));
    assert.equal(g.frame, null);
    g.play(); g.setCentered(false); assert.equal(g.frame, null);
  } finally { g.dispose(); }
});
test('sustained low FPS demotes but 60 FPS and hidden frames do not', () => {
  const q = createGraphics('auto', 'medium');
  for (let i=0; i<1500; i++) q.sample(1/60, true);
  assert.equal(q.quality, 'medium');
  for (let i=0; i<900; i++) q.sample(1/30, false);
  assert.equal(q.quality, 'medium');
  for (let i=0; i<600; i++) q.sample(1/30, true);
  assert.equal(q.quality, 'low');
});
test('pixel budget holds at Retina and 4K sizes', () => {
  for (const [w,h] of [[940,600],[3840,2160]]) {
    const r = graphicsPixelRatio('low', 2, w,h);
    assert.ok(w*h*r*r <= 1280*720 + 1);
  }
});
