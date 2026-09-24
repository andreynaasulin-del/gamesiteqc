// One icon set for the whole landing: Lucide (ISC/MIT), 24-unit grid,
// 2px round stroke. Chosen because its geometry matches the pill buttons —
// same optical weight as the 600 League Spartan label next to it. Text
// glyphs (↗ → ▶) were the previous "icons"; they render in whatever font
// the OS falls back to, so the arrow on Windows was a different shape
// and baseline from the arrow on macOS.
//
// Usage in markup:   <i class="i" data-icon="arrow-up-right"></i>
// Usage in templates: ${icon("play")}
// hydrateIcons() fills every [data-icon] once at boot; icons are decorative
// (aria-hidden) — the button label carries the meaning.

const PATHS = {
  "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  play: '<path d="M6 4.5v15a.5.5 0 0 0 .76.43l12.5-7.5a.5.5 0 0 0 0-.86L6.76 4.07A.5.5 0 0 0 6 4.5z" fill="currentColor" stroke="none"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  "log-out":
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  gamepad:
    '<path d="M6 11h4"/><path d="M8 9v4"/><path d="M15 12h.01"/><path d="M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "lock-open":
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  coins:
    '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  expand:
    '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  // Role marks for the agents. The page used to show three stock portraits;
  // a role reads faster than a face nobody knows, and it cannot look uncanny.
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  waveform:
    '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  // Chip marks (feature tags).
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "file-code":
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>',
  laptop:
    '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

export function icon(name, className = "i") {
  const body = PATHS[name];
  if (!body) throw new Error(`Unknown icon "${name}"`);
  return `<i class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg></i>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (!PATHS[name]) return;
    el.setAttribute("aria-hidden", "true");
    el.classList.add("i");
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${PATHS[name]}</svg>`;
  });
}
