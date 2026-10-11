import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: { index: 'src/index.ts', animate: 'src/animate.ts' },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
})

export default config
