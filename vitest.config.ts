import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Unit-test runner config. Tests live in `tests/` (kept out of the app
 * tsconfig includes so `npm run typecheck` stays focused on shippable code)
 * and exercise the pure, platform-agnostic logic — currently the slash-command
 * core in src/shared and its renderer helpers.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Default to node; component tests opt into a DOM via `// @vitest-environment happy-dom`.
    environment: 'node'
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
