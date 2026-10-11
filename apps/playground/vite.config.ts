import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const source = (path: string): string =>
  fileURLToPath(new URL(`../../packages/${path}`, import.meta.url))

/**
 * Inlines the built scripts and styles into `index.html`, so the playground is
 * a single self-contained file that can be opened or hosted anywhere. Also
 * writes `fragment.html`: the same page without the document skeleton, for
 * hosts that provide their own `<html>`, `<head>` and `<body>`.
 */
function singleFile(): Plugin {
  return {
    name: 'morphfx:single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html']
      if (page?.type !== 'asset') return
      let html = String(page.source)

      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          // `</script` inside the code would end the inline script early.
          const code = file.code.replaceAll('</script', '<\\/script')
          html = html.replace(
            new RegExp(`<script[^>]*src="[./]*${escapeRegExp(name)}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          )
          delete bundle[name]
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          html = html.replace(
            new RegExp(`<link[^>]*href="[./]*${escapeRegExp(name)}"[^>]*>`),
            () => `<style>${String(file.source)}</style>`,
          )
          delete bundle[name]
        }
      }
      page.source = html

      const inner = (tag: string): string =>
        html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`))?.[1] ?? ''
      this.emitFile({
        type: 'asset',
        fileName: 'fragment.html',
        source: `${inner('head').replace(/<meta[^>]*>\s*/g, '')}\n${inner('body')}`,
      })
    },
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default defineConfig({
  base: './',
  plugins: [react(), singleFile()],
  // Use the packages' source, so edits to them show up instantly (no build needed).
  resolve: {
    alias: [
      { find: /^@morphfx\/core$/, replacement: source('core/src/index.ts') },
      { find: /^@morphfx\/core\/animate$/, replacement: source('core/src/animate.ts') },
      { find: /^@morphfx\/react$/, replacement: source('react/src/index.ts') },
    ],
  },
  build: {
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    modulePreload: false,
  },
})
