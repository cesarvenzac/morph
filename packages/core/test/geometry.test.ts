import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  appendSplitSegmentAt,
  centroid,
  containsPoint,
  flatten,
  limitSegmentLength,
  reverse,
  rotate,
  segmentCount,
  signedArea,
  subdivide,
} from '../src/geometry'
import { normalize } from '../src/normalize'
import { expectSameShape, pointAt } from './helpers'

const square = normalize('M0 0 H10 V10 H0 Z')[0].points
const curve = [0, 0, 10, 40, 60, -20, 80, 30]

describe('appendSplitSegmentAt', () => {
  it('splits a segment exactly', () => {
    const out = [curve[0], curve[1]]
    appendSplitSegmentAt(curve, 0, [0.25, 0.6], out)
    expect(segmentCount(out)).toBe(3)
    // Each part traces the original curve between its split parameters.
    const ranges = [
      [0, 0.25],
      [0.25, 0.6],
      [0.6, 1],
    ]
    ranges.forEach(([from, to], part) => {
      for (const t of [0, 0.3, 0.7, 1]) {
        const [x, y] = pointAt(out, part, t)
        const [ex, ey] = pointAt(curve, 0, from + (to - from) * t)
        expect(x).toBeCloseTo(ex, 9)
        expect(y).toBeCloseTo(ey, 9)
      }
    })
  })

  it('creates zero-length parts for repeated parameters', () => {
    const out = [curve[0], curve[1]]
    appendSplitSegmentAt(curve, 0, [0.5, 0.5], out)
    expect(segmentCount(out)).toBe(3)
    expect(out.slice(8, 14).every((v, i) => v === out[6 + (i % 2)])).toBe(true)
  })
})

describe('subdivide', () => {
  it('reaches the target count without changing the shape', () => {
    const points = subdivide(square, 11)
    expect(segmentCount(points)).toBe(11)
    expectSameShape([{ points, closed: true }], [{ points: square, closed: true }], 1e-6)
  })

  it('leaves subpaths that already have enough segments alone', () => {
    expect(subdivide(square, 2)).toEqual(square)
  })
})

describe('limitSegmentLength', () => {
  it('splits long segments', () => {
    const points = limitSegmentLength(square, 3)
    expect(segmentCount(points)).toBe(16)
    expectSameShape([{ points, closed: true }], [{ points: square, closed: true }], 1e-6)
  })
})

describe('reverse and rotate', () => {
  it('reverses a subpath', () => {
    const reversed = reverse(square)
    expect(reversed.slice(0, 2)).toEqual([0, 0])
    expect(reversed.slice(-2)).toEqual([0, 0])
    expect(Math.sign(signedArea(flatten(reversed, 4)))).toBe(
      -Math.sign(signedArea(flatten(square, 4))),
    )
    expect(reverse(reversed)).toEqual(square)
  })

  it('rotates a closed subpath to start at another anchor', () => {
    const rotated = rotate(square, 1)
    expect(rotated.slice(0, 2)).toEqual([10, 0])
    expect(rotated.slice(-2)).toEqual([10, 0])
    expect(rotate(square, 4)).toEqual(square)
    expectSameShape([{ points: rotated, closed: true }], [{ points: square, closed: true }], 1e-9)
  })

  it('round-trips on random closed subpaths', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 6, maxLength: 36 }),
        fc.integer({ min: 0, max: 20 }),
        (values, offset) => {
          const usable = values.slice(0, values.length - (values.length % 6))
          if (usable.length === 0) return
          // Close the subpath on its start point.
          const points = [0, 0, ...usable.slice(0, -2), 0, 0]
          const count = segmentCount(points)
          expect(rotate(rotate(points, offset), count - (offset % count))).toEqual(points)
          expect(reverse(reverse(points))).toEqual(points)
        },
      ),
    )
  })
})

describe('polygon helpers', () => {
  const polygon = [0, 0, 10, 0, 10, 10, 0, 10]

  it('computes signed area, clockwise on screen being positive', () => {
    expect(signedArea(polygon)).toBe(100)
    expect(signedArea([0, 0, 0, 10, 10, 10, 10, 0])).toBe(-100)
  })

  it('computes centroids, falling back to the mean without area', () => {
    expect(centroid(polygon)).toEqual([5, 5])
    expect(centroid([0, 0, 10, 0])).toEqual([5, 0])
  })

  it('tests whether a point is inside', () => {
    expect(containsPoint(polygon, 5, 5)).toBe(true)
    expect(containsPoint(polygon, 15, 5)).toBe(false)
  })
})
