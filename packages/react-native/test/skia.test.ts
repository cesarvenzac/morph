/// <reference types="node" />
// Runs the Skia step builder against real Skia (CanvasKit, the WebAssembly
// build React Native Skia uses on the web), without React Native.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { morph, normalize } from '@morphfx/core'
import type { Skia } from '@shopify/react-native-skia'
import { beforeAll, describe, expect, it } from 'vitest'
import data from '../../../fixtures/morphs.json'
import { skiaSteps } from '../src/skiaSteps'

const { shapes, pairs } = data as { shapes: Record<string, string>; pairs: string[][] }
const require = createRequire(import.meta.url)
let skia: typeof Skia

beforeAll(async () => {
  const base = dirname(require.resolve('@shopify/react-native-skia/package.json'))
  const init = require(require.resolve('canvaskit-wasm/bin/full/canvaskit', { paths: [base] }))
  const canvasKit = await init()
  ;(globalThis as { CanvasKit?: unknown }).CanvasKit = canvasKit
  skia = require(join(base, 'lib/commonjs/skia/web/JsiSkia')).JsiSkApi(canvasKit)
})

/** Largest coordinate difference between two paths with the same anchors. */
function difference(a: string, b: string): number {
  const pa = normalize(a)
  const pb = normalize(b)
  let max = 0
  pa.forEach((subpath, i) => {
    subpath.points.forEach((value, j) => {
      max = Math.max(max, Math.abs(value - pb[i].points[j]))
    })
  })
  return max
}

describe('skiaSteps', () => {
  it('builds interpolatable paths that Skia morphs like @morphfx/core', () => {
    for (const [a, b] of pairs) {
      const [step] = skiaSteps(skia, [shapes[a], shapes[b]])
      const mix = morph(shapes[a], shapes[b], { precision: 4 })
      for (const t of [0, 0.3, 0.7, 1]) {
        const skiaFrame = step.to.interpolate(step.from, t)?.toSVGString() ?? ''
        // Skia writes an explicit line back to the start before closing.
        const withoutClosingLines = skiaFrame.replace(/L[^A-Za-z]*Z/g, 'Z')
        expect(difference(withoutClosingLines, mix(t)), `${a} → ${b} at ${t}`).toBeLessThan(1e-3)
      }
    }
  })

  it('builds one step per pair of keyframes', () => {
    expect(skiaSteps(skia, [shapes.circle, shapes.square, shapes.star])).toHaveLength(2)
    expect(skiaSteps(skia, [shapes.heart])).toHaveLength(1)
    expect(() => skiaSteps(skia, [])).toThrow(TypeError)
  })
})
