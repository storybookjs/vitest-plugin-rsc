import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { preview } from '@vitest/browser-preview'
import { vitestPluginRSC } from 'vitest-plugin-rsc'
import { vitestPluginNext } from 'vitest-plugin-rsc/nextjs/plugin'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

const browserProvider = process.env.BROWSER_PROVIDER
const isRunMode =
  Boolean(process.env.CI) ||
  process.argv.includes('run') ||
  process.argv.includes('--run')

export default defineConfig({
  plugins: [tsconfigPaths(), react(), vitestPluginRSC(), vitestPluginNext()],
  test: {
    testTimeout: 3000,
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: browserProvider === 'preview' ? false : isRunMode,
      ui: !isRunMode,
      provider: browserProvider === 'preview' ? preview() : playwright(),
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }]
    },
    setupFiles: ['./test/vitest.setup.ts']
  },
  environments: {
    react_client: {
      optimizeDeps: {
        include: ['marked', 'sanitize-html']
      }
    }
  }
})
