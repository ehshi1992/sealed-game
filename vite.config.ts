/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
    // Ignore stale worktree copies under .claude/worktrees — they carry their own
    // broken node_modules and produce false test failures during the main run.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
