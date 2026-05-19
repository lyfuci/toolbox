import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest config — pure-function tests only for now (no DOM mocks). Most of
 * the image editor's logic lives in `src/lib/image-editor/*.ts` and is
 * fully deterministic on RGBA arrays / data structures, so we don't need
 * jsdom. If we add component tests later, switch `environment` to
 * `happy-dom` and import `@testing-library/react`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
  },
})
