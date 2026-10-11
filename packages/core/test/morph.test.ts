import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type CubicPath,
  interpolate,
  mixer,
  morph,
  normalize,
  type PreparedMorph,
  parsePath,
  prepare,
  serialize,
} from '../src'
import { expectSameShape, fixtures, signedArea } from './helpers'

const { shapes, pairs } = fixtures

/** Splits a prepared morph back into its two shapes. */
function sides(prepared: PreparedMorph): [CubicPath, CubicPath] {
  const from: CubicPath = []
  const to: CubicPath = []
  let start = 0
  for (let s = 0; s < prepared.layout.length; s += 2) {
    const end = start + 2 + 6 * prepared.layout[s]
    const closed = prepared.layout[s + 1] === 1
    from.push({ points: prepared.from.slice(start, end), closed })
    to.push({ points: prepared.to.slice(start, end), closed })
    start = end
  }
  return [from, to]
}

describe('prepare', () => {
  it('gives both sides the same layout', () => {
    const prepared = prepare(shapes.circle, shapes.star)
    expect(prepared.version).toBe(1)
    expect(prepared.from).toHaveLength(prepared.to.length)
    const expectedLength = prepared.layout.reduce(
      (sum, value, i) => (i % 2 === 0 ? sum + 2 + 6 * value : sum),
      0,
    )
    expect(prepared.from).toHaveLength(expectedLength)
  })

  it('pairs points by relative position along the outline', () => {
    // The top of the circle goes to the middle of the square's top edge,
    // and the square's corners get a counterpart on the circle's diagonals.
    const [from, to] = sides(prepare(shapes.circle, shapes.square))
    const anchors = (points: number[]): string[] => {
      const result: string[] = []
      for (let i = 0; i < points.length; i += 6)
        result.push(`${points[i].toFixed(1)},${points[i + 1].toFixed(1)}`)
      return result
    }
    const a = anchors(from[0].points)
    const b = anchors(to[0].points)
    expect(b[a.indexOf('50.0,10.0')]).toBe('50.0,10.0')
    const diagonal = (50 + 40 * Math.cos(Math.PI / 4)).toFixed(1)
    expect(b[a.indexOf(`${diagonal},${(100 - Number(diagonal)).toFixed(1)}`)]).toBe('90.0,10.0')
  })

  it('keeps every fixture exact at both ends', () => {
    for (const [a, b] of pairs) {
      const [from, to] = sides(prepare(shapes[a], shapes[b]))
      expectSameShape(from, shapes[a], 0.02)
      expectSameShape(to, shapes[b], 0.02)
    }
  })

  it('gives paired closed subpaths the same winding', () => {
    for (const [a, b] of pairs) {
      const [from, to] = sides(prepare(shapes[a], shapes[b]))
      from.forEach((subpath, i) => {
        if (!subpath.closed) return
        const areaA = signedArea(subpath.points)
        const areaB = signedArea(to[i].points)
        if (Math.abs(areaA) > 1 && Math.abs(areaB) > 1) {
          expect(Math.sign(areaA), `${a} → ${b}, subpath ${i}`).toBe(Math.sign(areaB))
        }
      })
    }
  })

  it('does not flip a shape drawn in the other direction', () => {
    const mix = morph(shapes.square, shapes['square-ccw'])
    for (const t of [0.25, 0.5, 0.75]) expectSameShape(mix(t), shapes.square, 0.02)
  })

  it('grows a subpath without a partner from its centroid', () => {
    const [from, to] = sides(prepare(shapes.circle, shapes.ring))
    expect(from).toHaveLength(2)
    const grown = from.findIndex(({ points }) => points.every((v, i) => v === points[i % 2]))
    expect(grown).not.toBe(-1)
    expect(from[grown].points[0]).toBeCloseTo(50, 6)
    expect(from[grown].points[1]).toBeCloseTo(50, 6)
    expect(to[grown].points.every((v, i) => v === to[grown].points[i % 2])).toBe(false)
  })

  it('pairs subpaths by position', () => {
    // The left circle of `two-circles` is closest to the left bar of `pause`.
    const [from, to] = sides(prepare(shapes['two-circles'], shapes.pause))
    const centerX = (points: number[]): number => {
      let sum = 0
      for (let i = 0; i < points.length; i += 2) sum += points[i]
      return sum / (points.length / 2)
    }
    from.forEach((subpath, i) => {
      expect(Math.sign(centerX(subpath.points) - 50)).toBe(Math.sign(centerX(to[i].points) - 50))
    })
  })

  it("keeps start points and order with align: 'none'", () => {
    const prepared = prepare('M0 0 L10 0 L10 10 Z', 'M20 20 L30 20 L30 30 L20 30 Z', {
      align: 'none',
    })
    expect(prepared.layout).toEqual([4, 1])
    expect(prepared.from.slice(0, 2)).toEqual([0, 0])
    expect(prepared.to.slice(0, 2)).toEqual([20, 20])
  })

  it('splits long segments with maxSegmentLength', () => {
    const coarse = prepare(shapes.square, shapes.circle)
    const fine = prepare(shapes.square, shapes.circle, { maxSegmentLength: 5 })
    expect(fine.layout[0]).toBeGreaterThan(coarse.layout[0])
    expect(fine.layout[0]).toBeGreaterThanOrEqual(64)
    const [from, to] = sides(fine)
    expectSameShape(from, shapes.square, 0.02)
    expectSameShape(to, shapes.circle, 0.02)
  })

  it('accepts normalized paths', () => {
    expect(prepare(normalize(shapes.circle), normalize(shapes.star))).toEqual(
      prepare(shapes.circle, shapes.star),
    )
  })

  it('closes normalized subpaths that do not end on their start', () => {
    const prepared = prepare([{ points: [0, 0, 1, 0, 2, 0, 3, 0], closed: true }], shapes.circle)
    const [from] = sides(prepared)
    expect(from[0].points.slice(-2)).toEqual(from[0].points.slice(0, 2))
  })

  it('rejects malformed normalized paths', () => {
    expect(() => prepare([{ points: [0, 0, 1], closed: false }], shapes.circle)).toThrow(TypeError)
  })

  it('handles empty shapes', () => {
    expect(prepare('', '')).toEqual({ version: 1, layout: [], from: [], to: [] })
    const [from, to] = sides(prepare('', shapes.circle))
    expect(from[0].points.every((v, i) => v === from[0].points[i % 2])).toBe(true)
    expectSameShape(to, shapes.circle, 0.02)
  })

  it('produces JSON-serializable data', () => {
    const prepared = prepare(shapes.heart, shapes.star)
    expect(JSON.parse(JSON.stringify(prepared))).toEqual(prepared)
  })
})

describe('interpolate', () => {
  it('returns the source at 0 and the target at 1', () => {
    const mix = interpolate(prepare(shapes.circle, shapes.star))
    expectSameShape(mix(0), shapes.circle)
    expectSameShape(mix(1), shapes.star)
  })

  it('returns in-between shapes and extrapolates outside [0, 1]', () => {
    const mix = interpolate(prepare('M0 0 H10', 'M0 10 H10'))
    expectSameShape(mix(0.5), 'M0 5 H10')
    expectSameShape(mix(1.5), 'M0 15 H10')
    expectSameShape(mix(-1), 'M0 -10 H10')
  })

  it('respects the precision option', () => {
    const mix = interpolate(prepare(shapes.circle, shapes.heart), { precision: 1 })
    for (const number of mix(0.37).match(/-?\d+(\.\d+)?/g) ?? []) {
      expect(number.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1)
    }
  })

  it('writes empty path data for empty shapes', () => {
    expect(interpolate(prepare('', ''))(0.5)).toBe('')
  })
})

describe('morph', () => {
  it('morphs between two shapes', () => {
    const mix = morph(shapes.play, shapes.pause)
    expectSameShape(mix(0), shapes.play)
    expectSameShape(mix(1), shapes.pause)
    expect(() => parsePath(mix(0.5))).not.toThrow()
  })

  it('goes through keyframes', () => {
    const mix = morph([shapes.circle, shapes.square, shapes.star])
    expectSameShape(mix(0), shapes.circle)
    expectSameShape(mix(0.5), shapes.square)
    expectSameShape(mix(1), shapes.star)
    expect(mix(0.25)).toBe(morph(shapes.circle, shapes.square)(0.5))
    expect(mix(0.75)).toBe(morph(shapes.square, shapes.star)(0.5))
    expect(() => parsePath(mix(1.2))).not.toThrow()
    expect(() => parsePath(mix(-0.2))).not.toThrow()
  })

  it('accepts a single keyframe', () => {
    const mix = morph([shapes.circle])
    expect(mix(0.3)).toBe(serialize(normalize(shapes.circle)))
  })

  it('rejects an empty list of keyframes', () => {
    expect(() => morph([])).toThrow(TypeError)
  })

  it('passes options through', () => {
    const prepared = prepare(shapes.circle, shapes.square, { align: 'none' })
    expect(morph(shapes.circle, shapes.square, { align: 'none', precision: 2 })(0.5)).toBe(
      interpolate(prepared, { precision: 2 })(0.5),
    )
  })

  it('works as a Motion mixer', () => {
    expect(mixer(shapes.circle, shapes.heart)(0.4)).toBe(morph(shapes.circle, shapes.heart)(0.4))
  })
})

const coordinate = fc.integer({ min: -200, max: 200 })
const command = fc.oneof(
  fc
    .tuple(fc.constantFrom('L', 'l', 'T'), coordinate, coordinate)
    .map(([c, ...v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(fc.constantFrom('C', 'c'), fc.array(coordinate, { minLength: 6, maxLength: 6 }))
    .map(([c, v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(fc.constantFrom('Q', 'S'), fc.array(coordinate, { minLength: 4, maxLength: 4 }))
    .map(([c, v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(
      fc.integer({ min: 1, max: 100 }),
      fc.constantFrom(0, 1),
      fc.constantFrom(0, 1),
      coordinate,
      coordinate,
    )
    .map(([r, large, sweep, x, y]) => `A${r} ${r} 0 ${large} ${sweep} ${x} ${y}`),
)
const subpath = fc
  .tuple(coordinate, coordinate, fc.array(command, { minLength: 1, maxLength: 8 }), fc.boolean())
  .map(([x, y, rest, closed]) => `M${x} ${y} ${rest.join(' ')}${closed ? ' Z' : ''}`)
const path = fc.array(subpath, { minLength: 1, maxLength: 3 }).map((parts) => parts.join(' '))

describe('morph (property-based)', () => {
  it('always produces valid path data and exact endpoints', () => {
    fc.assert(
      fc.property(path, path, fc.double({ min: 0, max: 1, noNaN: true }), (a, b, t) => {
        const mix = morph(a, b, { precision: 6 })
        const frame = mix(t)
        expect(frame).not.toMatch(/NaN|Infinity/)
        expect(() => parsePath(frame)).not.toThrow()
        // Tolerance scales with the coordinates (up to a few hundred units).
        expectSameShape(mix(0), a, 0.05)
        expectSameShape(mix(1), b, 0.05)
      }),
      { numRuns: 60 },
    )
  })
})
