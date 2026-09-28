import posthog from 'posthog-js';
import { TRACK_EVENT, type TrackDetail, type TrackTags } from './events';

// Games embedded in the landing are part of the parent session, not separate visits.
const params = new URLSearchParams(location.search);
const embedded = params.has('embed') || window.top !== window.self;
const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);

type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
type ClarityWindow = Window & { clarity?: Clarity };

const GAME_BY_PATH: Record<string, string> = { play: 'playground', rocket: 'rocket', strike: 'strike' };
// Sessions with these events are always kept in full, whatever Clarity's sampling decides.
const UPGRADE_ON = new Set(['cta_download', 'plan_click', 'js_error', 'webgl_lost', 'game_ready_slow']);

if (!embedded && navigator.doNotTrack !== '1' && !(local && !params.has('analytics'))) {
  const w = window as ClarityWindow;
  const stub = ((...args: unknown[]) => { (stub.q ??= []).push(args); }) as Clarity;
  w.clarity ??= stub;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.clarity.ms/tag/ypbphygsxd';
  document.head.appendChild(script);

  const call = (...args: unknown[]) => { try { w.clarity?.(...args); } catch { /* tag blocked */ } };
  const setTag = (key: string, value: string | number | boolean) =>
    call('set', key, String(value).slice(0, 255));

  const event = (name: string, tags?: TrackTags) => {
    // Raw milliseconds make an unfilterable tag; buckets are what Clarity segments need.
    for (const [k, v] of Object.entries(tags ?? {})) {
      if (k === 'load_ms') setTag('load_bucket', loadBucket(Number(v)));
      else setTag(k, v);
    }
    call('event', name);
    if (UPGRADE_ON.has(name)) call('upgrade', name);
    // Same event stream for GTM: custom-event triggers on `qc_<name>`, params as dataLayer variables.
    const dl = ((window as Window & { dataLayer?: unknown[] }).dataLayer ??= []);
    dl.push({ event: `qc_${name}`, ...tags });
  };

  const pathKey = location.pathname.match(/\/(play|rocket|strike)(?:\.html)?$/)?.[1];
  const game = pathKey ? GAME_BY_PATH[pathKey] : undefined;
  const page = game ?? (location.pathname === '/' || location.pathname.endsWith('index.html') ? 'landing' : location.pathname);

  tagContext(setTag, page, game);
  linkIdentities(call);
  trackErrors(event);

  window.addEventListener(TRACK_EVENT, (e) => {
    const { name, tags } = (e as CustomEvent<TrackDetail>).detail;
    event(name, tags);
  });

  if (game) trackGamePage(event);
  else trackLanding(event);
}

function tagContext(setTag: (k: string, v: string | number | boolean) => void, page: string, game?: string) {
  const qs = new URLSearchParams(location.search);
  setTag('page', page);
  if (game) setTag('game', game);

  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = qs.get(key);
    if (v) setTag(key, v);
  }

  const ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
  const source = (qs.get('utm_source') ?? '').toLowerCase();
  const traffic =
    /^(x|twitter)$/.test(source) || /^(t\.co|x\.com|twitter\.com)$/.test(ref) ? 'x'
      : source ? 'campaign'
      : /google\.|bing\.|duckduckgo\.|yandex\.|yahoo\./.test(ref) ? 'search'
      : ref.endsWith('quadcode.ai') || ref.endsWith('quadcodegames.com') ? 'internal'
      : ref ? 'referral' : 'direct';
  setTag('traffic', traffic);
  if (ref) setTag('ref_host', ref);

  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  setTag('device', matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop');
  setTag('viewport', innerWidth < 768 ? 'sm' : innerWidth < 1280 ? 'md' : 'lg');
  setTag('webgpu', 'gpu' in nav);
  if (nav.hardwareConcurrency) setTag('cpu_cores', nav.hardwareConcurrency);
  if (nav.deviceMemory) setTag('memory_gb', nav.deviceMemory);
  setTag('lang', (navigator.language || 'unknown').slice(0, 5));

  const gpu = gpuRenderer();
  if (gpu) setTag('gpu', gpu);

  try {
    setTag('visitor', localStorage.getItem('qc_seen') ? 'returning' : 'new');
    localStorage.setItem('qc_seen', '1');
  } catch { /* storage disabled */ }
}

// Game performance complaints are almost always a GPU story; the renderer string makes them filterable.
function gpuRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'none';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name).replace(/ANGLE \((.*)\)/, '$1').slice(0, 80);
  } catch {
    return null;
  }
}

// Same person in Clarity and PostHog: Clarity gets the PostHog id, PostHog gets the Clarity replay ids.
function linkIdentities(call: (...args: unknown[]) => void) {
  let tries = 0;
  const attempt = () => {
    const ph = posthog as typeof posthog & { __loaded?: boolean };
    if (ph.__loaded) {
      const id = ph.get_distinct_id();
      if (id) call('identify', id, ph.get_session_id?.());
      call('metadata', (meta: { userId?: string; sessionId?: string; projectId?: string }) => {
        if (!meta?.sessionId) return;
        ph.register({ clarity_user_id: meta.userId, clarity_session_id: meta.sessionId });
      }, false, true, true);
      return;
    }
    if (++tries < 20) setTimeout(attempt, 500);
  };
  attempt();
}

function trackErrors(event: (name: string, tags?: TrackTags) => void) {
  let sent = 0;
  const report = (message: string) => {
    // Cross-origin scripts (extensions, third-party tags) surface as an empty "Script error." — nothing to act on.
    if (/^Script error\.?$/i.test(message) || sent++ >= 3) return;
    event('js_error', { js_error: message.slice(0, 120) });
  };
  window.addEventListener('error', (e) => report(e.message || 'error'));
  window.addEventListener('unhandledrejection', (e) =>
    report(e.reason instanceof Error ? e.reason.message : String(e.reason)));
  // webglcontextlost doesn't bubble; capture catches it on any canvas.
  document.addEventListener('webglcontextlost', () => event('webgl_lost'), true);
}

function trackGamePage(event: (name: string, tags?: TrackTags) => void) {
  window.addEventListener(TRACK_EVENT, (e) => {
    const { name, tags } = (e as CustomEvent<TrackDetail>).detail;
    if (name !== 'game_ready') return;
    if (Number(tags?.load_ms ?? 0) >= 8000) event('game_ready_slow');
    sampleFps(event);
  }, { once: true });

  trackTime(event, 'play', [30, 60, 180, 600]);
}

// 10 visible seconds after load: enough to see whether the device can run the game at all.
function sampleFps(event: (name: string, tags?: TrackTags) => void) {
  let frames = 0;
  let start = 0;
  const tick = (now: number) => {
    if (document.hidden) { start = 0; frames = 0; requestAnimationFrame(tick); return; }
    if (!start) start = now;
    frames++;
    if (now - start < 10000) { requestAnimationFrame(tick); return; }
    const fps = Math.round((frames * 1000) / (now - start));
    event('fps_sampled', { fps_bucket: fps < 20 ? '<20' : fps < 30 ? '20-29' : fps < 50 ? '30-49' : '50+' });
    if (fps < 30) event('low_fps');
  };
  requestAnimationFrame(tick);
}

function trackTime(event: (name: string) => void, prefix: string, marks: number[]) {
  let visible = 0;
  let last = performance.now();
  const pending = [...marks];
  setInterval(() => {
    const now = performance.now();
    if (!document.hidden) visible += (now - last) / 1000;
    last = now;
    while (pending.length && visible >= pending[0]) event(`${prefix}_${pending.shift()}s`);
  }, 5000);
}

function trackLanding(event: (name: string, tags?: TrackTags) => void) {
  const sectionOf = (el: Element | null) => {
    const s = el?.closest('section, header, footer');
    if (!s) return 'page';
    return (s.id || s.getAttribute('aria-labelledby')?.replace(/-title$/, '') || s.tagName.toLowerCase()).slice(0, 40);
  };

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const el = target?.closest('a, button, summary, [data-plan]');
    if (!el) return;
    const section = sectionOf(el);
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const plan = el.closest('[data-plan]')?.getAttribute('data-plan');
    const href = el instanceof HTMLAnchorElement ? el.href : '';

    if (plan) event('plan_click', { plan, cta_section: section });
    else if (href && /quadcode\.ai/.test(new URL(href, location.href).hostname)) {
      event('cta_download', { cta_section: section, cta_text: text });
    } else if (/\/(play|rocket|strike)(\.html)?/.test(href)) {
      event('open_game', { open_game: href.match(/(play|rocket|strike)/)?.[1] ?? 'unknown' });
    } else if (el.tagName === 'SUMMARY') {
      event('faq_open', { faq_last: text });
    } else if (section === 'pricing') {
      event('pricing_interact', { pricing_control: text });
    }
  }, { capture: true, passive: true });

  // First view of each section; Clarity heatmaps show where, this shows how far people get.
  const seen = new Set<string>();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const name = sectionOf(entry.target);
      io.unobserve(entry.target);
      if (seen.has(name) || !/^[a-z0-9_-]+$/i.test(name)) continue;
      seen.add(name);
      event(`view_${name.replace(/-/g, '_').toLowerCase()}`);
      setTagSafe('deepest_section', name);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll('main section, main > [id]').forEach((s) => io.observe(s));

  const depths = [25, 50, 75, 100];
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? (scrollY / max) * 100 : 100;
    while (depths.length && pct >= depths[0] - 1) event(`scroll_${depths.shift()}`);
  }, { passive: true });

  // Embedded games post their events here so the landing session shows gameplay depth.
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== TRACK_EVENT) return;
    const { name, tags } = e.data as TrackDetail & { type: string };
    if (typeof name !== 'string' || !/^[a-z0-9_]{1,48}$/.test(name)) return;
    event(`hero_${name}`.slice(0, 48), tags);
  });

  trackTime(event, 'time', [15, 60, 180]);
}

function loadBucket(ms: number): string {
  return ms < 3000 ? '<3s' : ms < 6000 ? '3-6s' : ms < 12000 ? '6-12s' : '12s+';
}

function setTagSafe(key: string, value: string) {
  try { (window as ClarityWindow).clarity?.('set', key, value); } catch { /* noop */ }
}
