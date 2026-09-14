import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sfxLabApiPlugin } from './vite-plugins/sfxLabApi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  plugins: [sfxLabApiPlugin(__dirname)],
  server: {
    port: 5177,
    strictPort: true,
  },
});
