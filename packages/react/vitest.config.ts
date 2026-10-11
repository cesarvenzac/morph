import { defineConfig, type ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
})

export default config
