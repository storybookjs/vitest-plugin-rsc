import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { vitestPluginRSC } from 'vitest-plugin-rsc'
import { vitestPluginNext } from 'vitest-plugin-rsc/nextjs/plugin'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react(), vitestPluginRSC(), vitestPluginNext()],
  test: {
    testTimeout: 3000,
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
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
