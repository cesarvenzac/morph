import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type CubicPath, normalize, serialize } from '../src'

type Point = [number, number]

/** Evaluates segment `index` of a subpath at parameter `t`. */
function pointAt(points: number[], index: number, t: number): Point {
  const o = index * 6
  const [x0, y0, x1, y1, x2, y2, x3, y3] = points.slice(o, o + 8)
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const e = t * t * t
  return [a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3]
}

/** Samples every segment of a path at a few parameters. */
function samples(path: CubicPath, steps = 8): Point[] {
  const result: Point[] = []
  for (const { points } of path) {
    const count = (points.length - 2) / 6
    for (let i = 0; i < count; i++) {
      for (let s = 0; s <= steps; s++) result.push(pointAt(points, i, s / steps))
    }
  }
  return result
}

function segmentCount(path: CubicPath): number[] {
  return path.map((subpath) => (subpath.points.length - 2) / 6)
}

function expectClose(actual: number[], expected: number[], digits = 9): void {
  expect(actual).toHaveLength(expected.length)
  for (const [i, value] of actual.entries()) expect(value).toBeCloseTo(expected[i], digits)
}

describe('normalize', () => {
  it('returns an empty path for empty input', () => {
    expect(normalize('')).toEqual([])
  })

  it('turns lines into cubics with control points at thirds', () => {
    expect(normalize('M0 0 L3 6')).toEqual([{ points: [0, 0, 1, 2, 2, 4, 3, 6], closed: false }])
  })

  it('handles H and V, absolute and relative', () => {
    const [subpath] = normalize('M1 1 H4 V7 h-3 v-6')
    const ends = []
    for (let i = 6; i < subpath.points.length; i += 6) {
      ends.push([subpath.points[i], subpath.points[i + 1]])
    }
    expect(ends).toEqual([
      [4, 1],
      [4, 7],
      [1, 7],
      [1, 1],
    ])
  })

  it('resolves relative commands against the current point', () => {
    const relative = normalize('m10 10 c1 2 3 4 5 6 l5 5 q1 1 2 2 a5 5 0 0 1 10 0')
    const absolute = normalize('M10 10 C11 12 13 14 15 16 L20 21 Q21 22 22 23 A5 5 0 0 1 32 23')
    expect(relative).toEqual(absolute)
  })

  it('reflects the previous control point for S', () => {
    const [subpath] = normalize('M0 0 C0 10 10 10 10 0 S20 -10 20 0')
    expect(subpath.points.slice(8, 10)).toEqual([10, -10])
  })

  it('uses the current point as first control point for S without a previous curve', () => {
    const [subpath] = normalize('M0 0 L10 0 S20 10 30 0')
    expect(subpath.points.slice(8, 10)).toEqual([10, 0])
  })

  it('converts quadratics exactly', () => {
    const [subpath] = normalize('M0 0 Q10 20 20 0')
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const u = 1 - t
      const quadratic = [2 * u * t * 10 + t * t * 20, 2 * u * t * 20]
      expectClose(pointAt(subpath.points, 0, t), quadratic)
    }
  })

  it('reflects the previous quadratic control point for T', () => {
    const smooth = normalize('M0 0 Q10 20 20 0 T40 0')
    const explicit = normalize('M0 0 Q10 20 20 0 Q30 -20 40 0')
    expect(smooth).toEqual(explicit)
  })

  it('closes subpaths and starts the next one from the subpath start', () => {
    const path = normalize('M0 0 L10 0 L10 10 Z l5 5')
    expect(path).toHaveLength(2)
    expect(path[0].closed).toBe(true)
    expect(segmentCount(path)).toEqual([3, 1])
    expect(path[0].points.slice(-2)).toEqual([0, 0])
    expect(path[1].points).toEqual([0, 0, 5 / 3, 5 / 3, 10 / 3, 10 / 3, 5, 5])
  })

  it('does not add a closing segment when the path already ends at its start', () => {
    expect(segmentCount(normalize('M0 0 L10 0 L0 0 Z'))).toEqual([2])
  })

  it('drops subpaths that draw nothing', () => {
    expect(normalize('M0 0 M5 5 L6 6 M7 7')).toEqual([
      { points: [5, 5, 5 + 1 / 3, 5 + 1 / 3, 5 + 2 / 3, 5 + 2 / 3, 6, 6], closed: false },
    ])
    expect(normalize('M0 0 Z')).toEqual([])
  })

  it('accepts already parsed commands', () => {
    expect(
      normalize([
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [3, 3] },
      ]),
    ).toEqual(normalize('M0 0 L3 3'))
  })

  describe('arcs', () => {
    it('approximates a circle within 0.03% of the radius', () => {
      const path = normalize('M-10 0 A10 10 0 1 0 10 0 A10 10 0 1 0 -10 0 Z')
      expect(segmentCount(path)).toEqual([4])
      for (const [x, y] of samples(path)) {
        expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(10 * 3e-4)
      }
    })

    it('honors the sweep flag', () => {
      // Quarter turns from (10, 0) to (0, 10): centered on (0, 0) when sweeping
      // in the positive-angle direction, on (10, 10) otherwise.
      const positive = normalize('M10 0 A10 10 0 0 1 0 10')
      const negative = normalize('M10 0 A10 10 0 0 0 0 10')
      const half = 10 * Math.SQRT1_2
      expectClose(pointAt(positive[0].points, 0, 0.5), [half, half], 2)
      expectClose(pointAt(negative[0].points, 0, 0.5), [10 - half, 10 - half], 2)
    })

    it('honors the large-arc flag', () => {
      expect(segmentCount(normalize('M10 0 A10 10 0 0 1 0 10'))).toEqual([1])
      expect(segmentCount(normalize('M10 0 A10 10 0 1 1 0 10'))).toEqual([3])
    })

    it('handles rotated ellipses', () => {
      const angle = Math.PI / 6
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
      const d = `M${-20 * cos} ${-20 * sin} A20 10 30 1 0 ${20 * cos} ${20 * sin} A20 10 30 1 0 ${-20 * cos} ${-20 * sin}`
      for (const [x, y] of samples(normalize(d))) {
        // Back into the ellipse's own frame, where (u/20)² + (v/10)² = 1.
        const u = x * cos + y * sin
        const v = -x * sin + y * cos
        expect(Math.abs(Math.hypot(u / 20, v / 10) - 1)).toBeLessThan(1e-3)
      }
    })

    it('scales up radii that are too small', () => {
      const path = normalize('M0 0 A1 1 0 0 1 10 0')
      for (const [x, y] of samples(path)) {
        expect(Math.abs(Math.hypot(x - 5, y) - 5)).toBeLessThan(5 * 3e-4)
      }
    })

    it('uses the absolute value of negative radii', () => {
      expect(normalize('M0 0 A-5 -5 0 0 1 10 0')).toEqual(normalize('M0 0 A5 5 0 0 1 10 0'))
    })

    it('draws a line when a radius is zero', () => {
      expect(normalize('M0 0 A0 5 0 0 1 3 3')).toEqual(normalize('M0 0 L3 3'))
    })

    it('omits arcs whose endpoints are equal', () => {
      expect(normalize('M0 0 A5 5 0 0 1 0 0 L3 3')).toEqual(normalize('M0 0 L3 3'))
    })

    it('ends exactly on the requested endpoint', () => {
      const [subpath] = normalize('M0 0 A7.3 3.1 17 1 0 12.345 -6.789')
      expect(subpath.points.slice(-2)).toEqual([12.345, -6.789])
    })
  })
})

describe('serialize', () => {
  it('writes compact path data', () => {
    expect(serialize(normalize('M0 0 L3 6 Z'))).toBe('M0 0C1 2 2 4 3 6 2 4 1 2 0 0Z')
  })

  it('rounds to the requested precision and never writes -0', () => {
    const path: CubicPath = [{ points: [1 / 3, -0.0001, 1, 2, 3, 4, 5, 6], closed: false }]
    expect(serialize(path)).toBe('M0.333 0C1 2 3 4 5 6')
    expect(serialize(path, { precision: 1 })).toBe('M0.3 0C1 2 3 4 5 6')
    expect(serialize(path, { precision: 0 })).toBe('M0 0C1 2 3 4 5 6')
  })

  it('writes every subpath', () => {
    expect(serialize(normalize('M0 0 L3 3 Z M6 6 L9 9'))).toBe(
      'M0 0C1 1 2 2 3 3 2 2 1 1 0 0ZM6 6C7 7 8 8 9 9',
    )
  })
})

const coordinate = fc.integer({ min: -1000, max: 1000 })
const drawCommand = fc.oneof(
  fc
    .tuple(fc.constantFrom('L', 'l', 'T', 't'), coordinate, coordinate)
    .map(([c, ...v]) => `${c}${v.join(' ')}`),
  fc.tuple(fc.constantFrom('H', 'h', 'V', 'v'), coordinate).map(([c, v]) => `${c}${v}`),
  fc
    .tuple(fc.constantFrom('C', 'c'), fc.array(coordinate, { minLength: 6, maxLength: 6 }))
    .map(([c, v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(
      fc.constantFrom('S', 's', 'Q', 'q'),
      fc.array(coordinate, { minLength: 4, maxLength: 4 }),
    )
    .map(([c, v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(
      fc.constantFrom('A', 'a'),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -360, max: 360 }),
      fc.constantFrom(0, 1),
      fc.constantFrom(0, 1),
      coordinate,
      coordinate,
    )
    .map(([c, ...v]) => `${c}${v.join(' ')}`),
  fc
    .tuple(fc.constantFrom('M', 'm'), coordinate, coordinate)
    .map(([c, ...v]) => `${c}${v.join(' ')}`),
  fc.constantFrom('Z', 'z'),
)
const pathArb = fc
  .tuple(coordinate, coordinate, fc.array(drawCommand, { maxLength: 30 }))
  .map(([x, y, rest]) => `M${x} ${y} ${rest.join(' ')}`)

describe('normalize (property-based)', () => {
  it('always produces finite, well-formed, continuous subpaths', () => {
    fc.assert(
      fc.property(pathArb, (d) => {
        for (const { points } of normalize(d)) {
          expect(points.length).toBeGreaterThan(2)
          expect((points.length - 2) % 6).toBe(0)
          expect(points.every(Number.isFinite)).toBe(true)
        }
      }),
    )
  })

  it('is stable when its own output is serialized and normalized again', () => {
    fc.assert(
      fc.property(pathArb, (d) => {
        const once = normalize(d)
        const twice = normalize(serialize(once, { precision: 9 }))
        expect(twice.map((s) => s.closed)).toEqual(once.map((s) => s.closed))
        for (const [i, subpath] of twice.entries()) expectClose(subpath.points, once[i].points, 6)
      }),
    )
  })
})
