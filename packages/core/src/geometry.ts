// Geometry helpers on the flat point lists of `CubicSubpath`:
// `[x0, y0, c1x, c1y, c2x, c2y, x1, y1, ...]`, 6 numbers per segment.

/** Number of cubic segments in a flat point list. */
export function segmentCount(points: readonly number[]): number {
  return (points.length - 2) / 6
}

/**
 * Approximate length of segment `index`: the average of its chord and of its
 * control polygon (accurate enough to distribute subdivisions).
 */
export function segmentLength(points: readonly number[], index: number): number {
  const o = index * 6
  const x0 = points[o]
  const y0 = points[o + 1]
  const x1 = points[o + 2]
  const y1 = points[o + 3]
  const x2 = points[o + 4]
  const y2 = points[o + 5]
  const x3 = points[o + 6]
  const y3 = points[o + 7]
  const chord = Math.hypot(x3 - x0, y3 - y0)
  const polygon =
    Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)
  return (chord + polygon) / 2
}

/**
 * Splits segment `index` into `pieces` parts of equal parameter length and
 * appends them to `out`, 6 numbers per part.
 */
export function appendSplitSegment(
  points: readonly number[],
  index: number,
  pieces: number,
  out: number[],
): void {
  const at = new Array<number>(pieces - 1)
  for (let k = 1; k < pieces; k++) at[k - 1] = k / pieces
  appendSplitSegmentAt(points, index, at, out)
}

/**
 * Splits segment `index` at the increasing parameters `at` (each in [0, 1])
 * with de Casteljau's algorithm, and appends the `at.length + 1` parts to
 * `out`, 6 numbers per part. The split is exact: the parts trace the same
 * curve as the original segment.
 */
export function appendSplitSegmentAt(
  points: readonly number[],
  index: number,
  at: readonly number[],
  out: number[],
): void {
  const o = index * 6
  let x0 = points[o]
  let y0 = points[o + 1]
  let x1 = points[o + 2]
  let y1 = points[o + 3]
  let x2 = points[o + 4]
  let y2 = points[o + 5]
  const x3 = points[o + 6]
  const y3 = points[o + 7]
  // Parameter (on the original segment) where the remaining curve starts.
  let consumed = 0

  for (const position of at) {
    const remaining = 1 - consumed
    const t = remaining > 1e-12 ? Math.min(1, Math.max(0, (position - consumed) / remaining)) : 0
    const ax = x0 + (x1 - x0) * t
    const ay = y0 + (y1 - y0) * t
    const bx = x1 + (x2 - x1) * t
    const by = y1 + (y2 - y1) * t
    const cx = x2 + (x3 - x2) * t
    const cy = y2 + (y3 - y2) * t
    const dx = ax + (bx - ax) * t
    const dy = ay + (by - ay) * t
    const ex = bx + (cx - bx) * t
    const ey = by + (cy - by) * t
    const px = dx + (ex - dx) * t
    const py = dy + (ey - dy) * t
    out.push(ax, ay, dx, dy, px, py)
    x0 = px
    y0 = py
    x1 = ex
    y1 = ey
    x2 = cx
    y2 = cy
    consumed = Math.max(consumed, position)
  }
  out.push(x1, y1, x2, y2, x3, y3)
}

/** Point at parameter `t` of segment `index`. */
export function pointOnSegment(
  points: readonly number[],
  index: number,
  t: number,
): [number, number] {
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

/**
 * Subdivides a subpath so it has exactly `target` segments, splitting the
 * longest segments first so that points stay evenly spread.
 * Returns the input unchanged when it already has `target` segments or more.
 */
export function subdivide(points: readonly number[], target: number): number[] {
  const count = segmentCount(points)
  if (count >= target) return points.slice()

  const lengths = new Array<number>(count)
  for (let i = 0; i < count; i++) lengths[i] = segmentLength(points, i)
  const pieces = distributePieces(lengths, target)

  const out = [points[0], points[1]]
  for (let i = 0; i < count; i++) appendSplitSegment(points, i, pieces[i], out)
  return out
}

/**
 * Splits every segment longer than `maxLength` into equal parts so that no
 * part is (approximately) longer than `maxLength`.
 */
export function limitSegmentLength(points: readonly number[], maxLength: number): number[] {
  const count = segmentCount(points)
  const out = [points[0], points[1]]
  for (let i = 0; i < count; i++) {
    const pieces = Math.max(1, Math.ceil(segmentLength(points, i) / maxLength))
    appendSplitSegment(points, i, pieces, out)
  }
  return out
}

/**
 * Decides how many pieces each segment is split into so that the total is
 * `target`: each extra piece goes to the segment whose pieces are currently
 * the longest.
 */
function distributePieces(lengths: readonly number[], target: number): number[] {
  const count = lengths.length
  const pieces = new Array<number>(count).fill(1)
  const total = lengths.reduce((sum, length) => sum + length, 0)

  for (let extra = target - count; extra > 0; extra--) {
    let best = 0
    let bestLength = -1
    for (let i = 0; i < count; i++) {
      // Degenerate paths have no length: spread the pieces evenly instead.
      const length = total > 0 ? lengths[i] / pieces[i] : 1 / pieces[i]
      if (length > bestLength) {
        bestLength = length
        best = i
      }
    }
    pieces[best]++
  }
  return pieces
}

/** Reverses the direction of a subpath. */
export function reverse(points: readonly number[]): number[] {
  const count = segmentCount(points)
  const out = [points[points.length - 2], points[points.length - 1]]
  for (let i = count - 1; i >= 0; i--) {
    const o = i * 6
    out.push(points[o + 4], points[o + 5], points[o + 2], points[o + 3], points[o], points[o + 1])
  }
  return out
}

/**
 * Rotates a closed subpath so that it starts at the end of segment
 * `offset - 1` (`offset` 0 returns a copy). Expects the subpath to end where
 * it starts.
 */
export function rotate(points: readonly number[], offset: number): number[] {
  const count = segmentCount(points)
  const shift = ((offset % count) + count) % count
  if (shift === 0) return points.slice()
  const start = shift * 6
  const out = [points[start], points[start + 1]]
  for (let i = 0; i < count; i++) {
    const o = ((shift + i) % count) * 6 + 2
    out.push(points[o], points[o + 1], points[o + 2], points[o + 3], points[o + 4], points[o + 5])
  }
  return out
}

/** Samples a subpath into a polyline: the start point, then `steps` points per segment. */
export function flatten(points: readonly number[], steps: number): number[] {
  const count = segmentCount(points)
  const out = [points[0], points[1]]
  for (let i = 0; i < count; i++) {
    for (let s = 1; s <= steps; s++) out.push(...pointOnSegment(points, i, s / steps))
  }
  return out
}

/**
 * Signed area of a closed polyline (shoelace formula). Positive when the
 * polygon turns clockwise on screen (SVG's y axis points down).
 */
export function signedArea(polygon: readonly number[]): number {
  let area = 0
  const n = polygon.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    area += polygon[i] * polygon[j + 1] - polygon[j] * polygon[i + 1]
  }
  return area / 2
}

/** Area-weighted centroid of a polygon, or the mean of its points when it has no area. */
export function centroid(polygon: readonly number[]): [number, number] {
  const n = polygon.length
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const cross = polygon[i] * polygon[j + 1] - polygon[j] * polygon[i + 1]
    area += cross
    cx += (polygon[i] + polygon[j]) * cross
    cy += (polygon[i + 1] + polygon[j + 1]) * cross
  }
  if (Math.abs(area) > 1e-12) return [cx / (3 * area), cy / (3 * area)]

  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i += 2) {
    sx += polygon[i]
    sy += polygon[i + 1]
  }
  return [sx / (n / 2), sy / (n / 2)]
}

/** Bounding box of a list of points: `[minX, minY, maxX, maxY]`. */
export function bounds(points: readonly number[]): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

/** Whether a point lies inside a polygon (even-odd rule, ray casting). */
export function containsPoint(polygon: readonly number[], x: number, y: number): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = polygon[i]
    const yi = polygon[i + 1]
    const xj = polygon[j]
    const yj = polygon[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
