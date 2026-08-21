/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ryuAnimAssetsPlugin } from './vite-plugins/ryuAnimAssets';
import { boxOverrideApiPlugin } from './vite-plugins/boxOverrideApi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  plugins: [ryuAnimAssetsPlugin(__dirname), boxOverrideApiPlugin(__dirname)],
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '../private/interim'),
        path.resolve(__dirname, '../private/assets'),
        path.resolve(__dirname, '../private/runtime'),
      ],
    },
  },
  resolve: {
    alias: {
      '@interim': path.resolve(__dirname, '../private/interim'),
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
