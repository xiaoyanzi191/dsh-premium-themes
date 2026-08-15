import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    // The two client-wiring/UI suites import the published client bundles of
    // the dsh packages, which ship as browser closure factories
    // (window.__ModuleLoader__.load) — not Node-importable ESM. They run
    // inside a deepseek-harness checkout, where vitest resolves the package
    // sources: `pnpm exec vitest run .` from the checkout package dir.
    exclude: ['tests/apply.client.spec.ts', 'tests/palette-row.client.spec.tsx'],
  },
})
