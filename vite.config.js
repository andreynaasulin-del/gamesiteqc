import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // One page per game plus the landing. The landing embeds a game in its
      // hero card via <iframe src="<page>?embed">, so every game page must be
      // its own entry — not a lazy chunk of the landing.
      input: {
        landing: page('index.html'),
        play: page('play.html'),
        rocket: page('rocket.html'),
        strike: page('strike.html')
      }
    }
  },
  // Large binary assets (FBX / HDR) live in /public and are served untouched.
  assetsInclude: ['**/*.fbx', '**/*.hdr']
});
