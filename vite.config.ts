import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the built game works from any folder (e.g. GitHub Pages).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
