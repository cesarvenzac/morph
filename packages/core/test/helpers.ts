import { expect } from 'vitest'
import data from '../../../fixtures/morphs.json'
import { type CubicPath, normalize } from '../src'

/** The shared fixture corpus (`fixtures/morphs.json`). */
export const fixtures: { shapes: Record<string, string>; pairs: string[][] } = data

export type Point = [number, number]

/** Point at parameter `t` of segment `index` of a flat point list. */
export function pointAt(points: readonly number[], index: number, t: number): Point {
  const o = index * 6
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * points[o] + b * points[o + 2] + c * points[o + 4] + d * points[o + 6],
    a * points[o + 1] + b * points[o + 3] + c * points[o + 5] + d * points[o + 7],
  ]
}

function isDegenerate(points: readonly number[]): boolean {
  return points.every((value, i) => value === points[i % 2])
}

/** Polylines approximating each visible (non-degenerate) subpath. */
export function polylines(path: CubicPath, steps: number): Point[][] {
  return path
    .filter(({ points }) => !isDegenerate(points))
    .map(({ points }) => {
      const line: Point[] = [[points[0], points[1]]]
      for (let i = 0; i < (points.length - 2) / 6; i++) {
        for (let s = 1; s <= steps; s++) line.push(pointAt(points, i, s / steps))
      }
      return line
    })
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Largest distance from a point of `a` to the outline of `b`. Distances above
 * `tolerance` are only guaranteed to be reported as "above `tolerance`": a
 * grid of `b`'s segments keeps the search local.
 */
function directedDistance(a: Point[][], b: Point[][], tolerance: number): number {
  const segments: [Point, Point][] = []
  for (const line of b) {
    if (line.length === 1) segments.push([line[0], line[0]])
    for (let i = 1; i < line.length; i++) segments.push([line[i - 1], line[i]])
  }
  if (segments.length === 0) return a.length === 0 ? 0 : Number.POSITIVE_INFINITY

  // Cells at least as large as the tolerance and as the average segment.
  let total = 0
  for (const [p, q] of segments) total += Math.hypot(q[0] - p[0], q[1] - p[1])
  const cell = Math.max(tolerance, total / segments.length, 1e-9)
  const grid = new Map<string, number[]>()
  segments.forEach(([p, q], index) => {
    for (
      let x = Math.floor(Math.min(p[0], q[0]) / cell);
      x <= Math.floor(Math.max(p[0], q[0]) / cell);
      x++
    ) {
      for (
        let y = Math.floor(Math.min(p[1], q[1]) / cell);
        y <= Math.floor(Math.max(p[1], q[1]) / cell);
        y++
      ) {
        const key = `${x},${y}`
        const bucket = grid.get(key)
        if (bucket) bucket.push(index)
        else grid.set(key, [index])
      }
    }
  })

  let worst = 0
  for (const line of a) {
    for (const point of line) {
      let nearest = Number.POSITIVE_INFINITY
      const cx = Math.floor(point[0] / cell)
      const cy = Math.floor(point[1] / cell)
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = cy - 1; y <= cy + 1; y++) {
          for (const index of grid.get(`${x},${y}`) ?? []) {
            const [p, q] = segments[index]
            nearest = Math.min(nearest, distanceToSegment(point, p, q))
          }
        }
      }
      if (nearest > tolerance) {
        // Rare (only on failure): measure exactly for a useful message.
        for (const [p, q] of segments) nearest = Math.min(nearest, distanceToSegment(point, p, q))
      }
      worst = Math.max(worst, nearest)
    }
  }
  return worst
}

/**
 * Asserts that two paths draw the same outlines (ignoring how they are split
 * into segments, and ignoring subpaths collapsed onto a single point).
 */
export function expectSameShape(
  actual: string | CubicPath,
  expected: string | CubicPath,
  tolerance = 0.05,
): void {
  const a = polylines(typeof actual === 'string' ? normalize(actual) : actual, 8)
  // Dense reference outlines, so their own approximation error stays negligible.
  const b = polylines(typeof expected === 'string' ? normalize(expected) : expected, 128)
  expect(a.length).toBe(b.length)
  expect(directedDistance(a, b, tolerance)).toBeLessThan(tolerance)
  expect(
    directedDistance(
      b,
      polylines(typeof actual === 'string' ? normalize(actual) : actual, 128),
      tolerance,
    ),
  ).toBeLessThan(tolerance)
}

/** Signed area of a subpath, approximated with a polyline. */
export function signedArea(points: readonly number[]): number {
  const [line] = polylines([{ points: [...points], closed: true }], 16)
  if (!line) return 0
  let area = 0
  for (let i = 0; i < line.length; i++) {
    const [x1, y1] = line[i]
    const [x2, y2] = line[(i + 1) % line.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}
