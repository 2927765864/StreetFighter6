/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ryuAnimAssetsPlugin } from './vite-plugins/ryuAnimAssets';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  plugins: [ryuAnimAssetsPlugin(__dirname)],
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
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
