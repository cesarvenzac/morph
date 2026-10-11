import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // Rolldown keeps the "use client" directive at the top of the single entry
  // chunk (scripts/check-use-client.mjs verifies it), but warns that it might not.
  suppressWarnings: /MODULE_LEVEL_DIRECTIVE/,
})

export default config
