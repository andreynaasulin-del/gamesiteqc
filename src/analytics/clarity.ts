// Games embedded in the landing are part of the parent session, not separate visits.
const params = new URLSearchParams(location.search);
const embedded = params.has('embed') || window.top !== window.self;
const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);

if (!embedded && navigator.doNotTrack !== '1' && !(local && !params.has('analytics'))) {
  type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
  const clarity = ((...args: unknown[]) => {
    (clarity.q ??= []).push(args);
  }) as Clarity;

  (window as Window & { clarity?: Clarity }).clarity ??= clarity;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.clarity.ms/tag/ypbphygsxd';
  document.head.appendChild(script);
}
