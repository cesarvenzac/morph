import { assign } from './assign'
import { correspond } from './correspond'
import {
  bounds,
  centroid,
  containsPoint,
  flatten,
  limitSegmentLength,
  reverse,
  segmentCount,
  signedArea,
  subdivide,
} from './geometry'
import { type CubicPath, normalize } from './normalize'

/** A shape to morph: SVG path data, or a path already normalized with `normalize()`. */
export type PathInput = string | CubicPath

export interface PrepareOptions {
  /**
   * How points of the two shapes are put in correspondence.
   *
   * - `'auto'` (default): pairs subpaths by position and size, gives paired
   *   subpaths the same winding, and rotates or reverses each subpath to
   *   minimize how far its points travel.
   * - `'none'`: pairs subpaths in order and keeps their start points and
   *   directions. Use it when both shapes were authored to correspond.
   *
   * @default 'auto'
   */
  align?: 'auto' | 'none'
  /**
   * Splits segments longer than this (in user units) before pairing points.
   * More segments give in-between shapes more freedom, at the cost of longer
   * path data. Off by default.
   */
  maxSegmentLength?: number
}

/**
 * The result of `prepare()`: two shapes with exactly the same structure, so
 * that every in-between frame is a plain linear interpolation of `from` and
 * `to`. It only holds numbers, so it can be serialized as JSON, computed on a
 * server or at build time, and copied to another thread.
 */
export interface PreparedMorph {
  version: 1
  /** Two numbers per subpath: its segment count, then 1 if it is closed, 0 otherwise. */
  layout: number[]
  /** Source points, subpath after subpath, laid out like `CubicSubpath.points`. */
  from: number[]
  /** Target points, with exactly the same layout as `from`. */
  to: number[]
}

type Kind = 'outer' | 'hole' | 'open'

/** A subpath with the measurements used to pair it. */
interface Shape {
  points: number[]
  closed: boolean
  kind: Kind
  /** Centroid. */
  x: number
  y: number
  /** Diagonal of the bounding box. */
  size: number
}

interface Pair {
  from: Shape | undefined
  to: Shape | undefined
}

const FLATTEN_STEPS = 8
/** Cost of pairing an outer contour with a hole: never worth it. */
const INCOMPATIBLE = 1e9

/**
 * Does the expensive part of a morph, once: puts the two shapes in point-to-
 * point correspondence. Feed the result to `interpolate()`.
 *
 * Subpaths are paired by position and size. A subpath without a partner grows
 * from (or shrinks into) its own centroid. In `'auto'` mode, closed subpaths are
 * given a canonical winding (outer contours one way, holes the other), which
 * keeps holes correct under both fill rules for well-formed paths.
 *
 * @throws {PathParseError} when given malformed path data.
 */
export function prepare(
  from: PathInput,
  to: PathInput,
  options: PrepareOptions = {},
): PreparedMorph {
  const align = options.align !== 'none'
  const maxLength = options.maxSegmentLength ?? 0
  const source = toCubicPath(from)
  const target = toCubicPath(to)
  const pairs = align ? pairByShape(source, target) : pairInOrder(source, target)

  const limit = (points: number[]): number[] =>
    maxLength > 0 ? limitSegmentLength(points, maxLength) : points

  const prepared: PreparedMorph = { version: 1, layout: [], from: [], to: [] }
  for (const { from: p, to: q } of pairs) {
    let a: number[]
    let b: number[]
    let closed: boolean

    if (p && q) {
      a = limit(p.points)
      b = limit(q.points)
      if (align) {
        ;[a, b] = correspond(a, p.closed, b, q.closed)
      } else {
        const count = Math.max(segmentCount(a), segmentCount(b))
        a = subdivide(a, count)
        b = subdivide(b, count)
      }
      closed = p.closed && q.closed
    } else if (p) {
      a = limit(p.points)
      b = collapse(a, p.x, p.y)
      closed = p.closed
    } else if (q) {
      b = limit(q.points)
      a = collapse(b, q.x, q.y)
      closed = q.closed
    } else {
      continue
    }

    prepared.layout.push(segmentCount(a), closed ? 1 : 0)
    for (const value of a) prepared.from.push(value)
    for (const value of b) prepared.to.push(value)
  }
  return prepared
}

function toCubicPath(input: PathInput): CubicPath {
  if (typeof input === 'string') return normalize(input)

  const path: CubicPath = []
  for (const { points, closed } of input) {
    if (points.length === 2) continue
    if (points.length < 8 || (points.length - 2) % 6 !== 0) {
      throw new TypeError(
        `Invalid subpath: expected 2 + 6 × (segment count) numbers, got ${points.length}`,
      )
    }
    const copy = points.slice()
    const n = copy.length
    // A closed subpath must end where it starts, or rotating it would break it.
    if (closed && (copy[n - 2] !== copy[0] || copy[n - 1] !== copy[1])) {
      const x = copy[n - 2]
      const y = copy[n - 1]
      const dx = copy[0] - x
      const dy = copy[1] - y
      copy.push(x + dx / 3, y + dy / 3, x + (2 * dx) / 3, y + (2 * dy) / 3, copy[0], copy[1])
    }
    path.push({ points: copy, closed })
  }
  return path
}

/** Measures every subpath of a path and gives closed ones a canonical winding. */
function analyze(path: CubicPath): Shape[] {
  const polygons = path.map((subpath) => flatten(subpath.points, FLATTEN_STEPS))

  return path.map((subpath, i): Shape => {
    const polygon = polygons[i]
    let points = subpath.points
    let kind: Kind = 'open'

    if (subpath.closed) {
      // Nesting depth decides whether a contour is an outer one or a hole.
      let depth = 0
      for (let j = 0; j < path.length; j++) {
        if (j !== i && path[j].closed && containsPoint(polygons[j], polygon[0], polygon[1])) depth++
      }
      kind = depth % 2 === 0 ? 'outer' : 'hole'
      const area = signedArea(polygon)
      if ((kind === 'outer' && area < 0) || (kind === 'hole' && area > 0)) points = reverse(points)
    }

    const [x, y] = centroid(polygon)
    const [minX, minY, maxX, maxY] = bounds(polygon)
    return {
      points,
      closed: subpath.closed,
      kind,
      x,
      y,
      size: Math.hypot(maxX - minX, maxY - minY),
    }
  })
}

/** Pairs subpaths of the same kind by position and size, then pairs leftovers when compatible. */
function pairByShape(source: CubicPath, target: CubicPath): Pair[] {
  const a = analyze(source)
  const b = analyze(target)
  const scale = diagonal(a, b)

  const cost = (p: Shape, q: Shape): number => {
    if (p.kind !== q.kind && p.kind !== 'open' && q.kind !== 'open') return INCOMPATIBLE
    const dx = p.x - q.x
    const dy = p.y - q.y
    const ds = p.size - q.size
    return (dx * dx + dy * dy + ds * ds) / (scale * scale)
  }

  const matchedA = new Array<number>(a.length).fill(-1)
  const matchedB = new Array<boolean>(b.length).fill(false)
  const match = (rows: number[], columns: number[]): void => {
    const assignment = assign(rows.map((i) => columns.map((j) => cost(a[i], b[j]))))
    assignment.forEach((column, row) => {
      if (column === -1) return
      const i = rows[row]
      const j = columns[column]
      if (cost(a[i], b[j]) >= INCOMPATIBLE) return
      matchedA[i] = j
      matchedB[j] = true
    })
  }

  // Same kinds first, then whatever is left (an open subpath can pair with anything).
  for (const kind of ['outer', 'hole', 'open'] as const) {
    match(
      indicesOf(a, (s) => s.kind === kind),
      indicesOf(b, (s) => s.kind === kind),
    )
  }
  match(
    indicesOf(a, (_, i) => matchedA[i] === -1),
    indicesOf(b, (_, j) => !matchedB[j]),
  )

  const pairs: Pair[] = a.map((shape, i) => ({
    from: shape,
    to: matchedA[i] === -1 ? undefined : b[matchedA[i]],
  }))
  b.forEach((shape, j) => {
    if (!matchedB[j]) pairs.push({ from: undefined, to: shape })
  })
  return pairs
}

/** Pairs subpaths by index, keeping them exactly as given. */
function pairInOrder(source: CubicPath, target: CubicPath): Pair[] {
  const describe = (subpath: CubicPath[number]): Shape => {
    const [x, y] = centroid(flatten(subpath.points, FLATTEN_STEPS))
    return { points: subpath.points, closed: subpath.closed, kind: 'open', x, y, size: 0 }
  }
  const pairs: Pair[] = []
  for (let i = 0; i < Math.max(source.length, target.length); i++) {
    pairs.push({
      from: i < source.length ? describe(source[i]) : undefined,
      to: i < target.length ? describe(target[i]) : undefined,
    })
  }
  return pairs
}

/** Diagonal of the box around every subpath of both shapes, used to normalize costs. */
function diagonal(a: readonly Shape[], b: readonly Shape[]): number {
  const all: number[] = []
  for (const shape of [...a, ...b]) {
    const [minX, minY, maxX, maxY] = bounds(shape.points)
    all.push(minX, minY, maxX, maxY)
  }
  if (all.length === 0) return 1
  const [minX, minY, maxX, maxY] = bounds(all)
  return Math.hypot(maxX - minX, maxY - minY) || 1
}

function indicesOf(
  shapes: readonly Shape[],
  predicate: (shape: Shape, index: number) => boolean,
): number[] {
  const indices: number[] = []
  shapes.forEach((shape, i) => {
    if (predicate(shape, i)) indices.push(i)
  })
  return indices
}

/** A subpath with the same layout as `points`, collapsed onto a single point. */
function collapse(points: readonly number[], x: number, y: number): number[] {
  const out = new Array<number>(points.length)
  for (let i = 0; i < points.length; i += 2) {
    out[i] = x
    out[i + 1] = y
  }
  return out
}
