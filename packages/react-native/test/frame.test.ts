import { interpolate, morph, prepare } from '@morphfx/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import data from '../../../fixtures/morphs.json'
import { frame, frameAt, keyframeData, toFrameData } from '../src/frame'

const { shapes, pairs } = data as { shapes: Record<string, string>; pairs: string[][] }

describe('frame', () => {
  it('matches interpolate() from @morphfx/core for every fixture', () => {
    for (const [a, b] of pairs) {
      const prepared = prepare(shapes[a], shapes[b])
      const mix = interpolate(prepared)
      const frameData = toFrameData(prepared)
      for (const t of [0, 0.25, 0.5, 0.75, 1, 1.2, -0.1]) {
        expect(frame(frameData, t)).toBe(mix(t))
      }
    }
  })

  it('respects the precision', () => {
    const prepared = prepare(shapes.circle, shapes.star)
    expect(frame(toFrameData(prepared, 1), 0.37)).toBe(
      interpolate(prepared, { precision: 1 })(0.37),
    )
  })
})

describe('keyframes', () => {
  it('matches morph() keyframes from @morphfx/core', () => {
    const paths = [shapes.circle, shapes.square, shapes.star, shapes.heart]
    const list = keyframeData(paths)
    const mix = morph(paths)
    fc.assert(
      fc.property(fc.double({ min: -0.2, max: 1.2, noNaN: true }), (t) => {
        expect(frameAt(list, t)).toBe(mix(t))
      }),
    )
  })

  it('shows a single shape at any progress', () => {
    const list = keyframeData([shapes.heart])
    expect(frameAt(list, 0)).toBe(frameAt(list, 1))
  })

  it('rejects an empty list', () => {
    expect(() => keyframeData([])).toThrow(TypeError)
  })
})
