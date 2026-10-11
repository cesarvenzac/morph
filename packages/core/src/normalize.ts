import { type PathCommand, parsePath } from './parse'

/** A subpath made only of absolute cubic Bézier segments. */
export interface CubicSubpath {
  /**
   * Flat list of coordinates: the start point `x, y`, then 6 numbers per
   * segment (first control point, second control point, end point).
   * The length is always `2 + 6 * segmentCount`.
   */
  points: number[]
  /** Whether the subpath was closed with `Z`. */
  closed: boolean
}

/** A path where every segment is an absolute cubic Bézier. */
export type CubicPath = CubicSubpath[]

const TWO_PI = Math.PI * 2
const HALF_PI = Math.PI / 2

/**
 * Converts path data into absolute cubic Béziers, the single representation
 * the morphing pipeline works on.
 *
 * - `L`, `H`, `V` become cubics with control points at 1/3 and 2/3 of the line.
 * - `Q`, `T` become exactly equivalent cubics.
 * - `A` becomes one cubic per quarter turn (or less), following the SVG
 *   implementation notes (out-of-range radii are scaled up).
 * - `Z` adds a closing segment when the last point differs from the start.
 *
 * Subpaths that draw nothing (a lone `M`, or an arc whose endpoints are equal)
 * are dropped.
 *
 * @throws {PathParseError} when given a malformed `d` string.
 */
export function normalize(input: string | readonly PathCommand[]): CubicPath {
  const commands = typeof input === 'string' ? parsePath(input) : input
  const path: CubicPath = []

  let subpath: CubicSubpath | undefined
  // Current point and start of the current subpath.
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  // Last control point, for the reflections of S and T.
  let controlX = 0
  let controlY = 0
  let previous = ''

  function segments(): number[] {
    if (subpath === undefined) {
      subpath = { points: [x, y], closed: false }
      path.push(subpath)
    }
    return subpath.points
  }

  function cubicTo(x1: number, y1: number, x2: number, y2: number, ex: number, ey: number): void {
    segments().push(x1, y1, x2, y2, ex, ey)
    controlX = x2
    controlY = y2
    x = ex
    y = ey
  }

  function lineTo(ex: number, ey: number): void {
    const dx = ex - x
    const dy = ey - y
    segments().push(x + dx / 3, y + dy / 3, x + (2 * dx) / 3, y + (2 * dy) / 3, ex, ey)
    x = ex
    y = ey
  }

  function quadTo(qx: number, qy: number, ex: number, ey: number): void {
    segments().push(
      x + (2 / 3) * (qx - x),
      y + (2 / 3) * (qy - y),
      ex + (2 / 3) * (qx - ex),
      ey + (2 / 3) * (qy - ey),
      ex,
      ey,
    )
    controlX = qx
    controlY = qy
    x = ex
    y = ey
  }

  function arcTo(
    rx: number,
    ry: number,
    rotation: number,
    largeArc: boolean,
    sweep: boolean,
    ex: number,
    ey: number,
  ): void {
    if (x === ex && y === ey) return
    if (rx === 0 || ry === 0) {
      lineTo(ex, ey)
      return
    }
    appendArc(segments(), x, y, Math.abs(rx), Math.abs(ry), rotation, largeArc, sweep, ex, ey)
    x = ex
    y = ey
  }

  for (const { type, values: v } of commands) {
    const command = type.toUpperCase()
    const relative = type !== command
    const ox = relative ? x : 0
    const oy = relative ? y : 0

    switch (command) {
      case 'M':
        x = startX = ox + v[0]
        y = startY = oy + v[1]
        subpath = undefined
        break
      case 'L':
        lineTo(ox + v[0], oy + v[1])
        break
      case 'H':
        lineTo(ox + v[0], y)
        break
      case 'V':
        lineTo(x, oy + v[0])
        break
      case 'C':
        cubicTo(ox + v[0], oy + v[1], ox + v[2], oy + v[3], ox + v[4], oy + v[5])
        break
      case 'S': {
        const smooth = previous === 'C' || previous === 'S'
        cubicTo(
          smooth ? 2 * x - controlX : x,
          smooth ? 2 * y - controlY : y,
          ox + v[0],
          oy + v[1],
          ox + v[2],
          oy + v[3],
        )
        break
      }
      case 'Q':
        quadTo(ox + v[0], oy + v[1], ox + v[2], oy + v[3])
        break
      case 'T': {
        const smooth = previous === 'Q' || previous === 'T'
        quadTo(smooth ? 2 * x - controlX : x, smooth ? 2 * y - controlY : y, ox + v[0], oy + v[1])
        break
      }
      case 'A':
        arcTo(v[0], v[1], v[2], v[3] !== 0, v[4] !== 0, ox + v[5], oy + v[6])
        break
      case 'Z':
        if (subpath !== undefined) {
          if (x !== startX || y !== startY) lineTo(startX, startY)
          subpath.closed = true
          subpath = undefined
        }
        x = startX
        y = startY
        break
    }
    previous = command
  }

  return path
}

/**
 * Appends the cubic approximation of an elliptical arc to `out`, using the
 * endpoint-to-center conversion from the SVG implementation notes.
 * Expects non-zero, positive radii and distinct endpoints.
 */
function appendArc(
  out: number[],
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): void {
  const phi = ((rotation % 360) * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)

  // Step 1: the start point in the ellipse's rotated frame.
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy

  // Scale up radii that are too small to connect both endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }

  // Step 2: the center in the rotated frame.
  const rx2 = rx * rx
  const ry2 = ry * ry
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p
  let coefficient = Math.sqrt(Math.max(0, numerator) / denominator)
  if (largeArc === sweep) coefficient = -coefficient
  const cxp = (coefficient * rx * y1p) / ry
  const cyp = (-coefficient * ry * x1p) / rx

  // Step 3: the center in user space.
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2

  // Step 4: start angle and sweep angle.
  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  let angle = Math.atan2(uy, ux)
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  if (!sweep && delta > 0) delta -= TWO_PI
  else if (sweep && delta < 0) delta += TWO_PI

  // One cubic per quarter turn at most keeps the radial error below 0.03%.
  const count = Math.max(1, Math.ceil(Math.abs(delta) / HALF_PI - 1e-9))
  const step = delta / count
  const k = (4 / 3) * Math.tan(step / 4)

  let cos1 = Math.cos(angle)
  let sin1 = Math.sin(angle)
  for (let n = 0; n < count; n++) {
    angle += step
    const cos2 = Math.cos(angle)
    const sin2 = Math.sin(angle)

    // Control points on the unit circle, then mapped onto the ellipse.
    const ax = cos1 - k * sin1
    const ay = sin1 + k * cos1
    const bx = cos2 + k * sin2
    const by = sin2 - k * cos2
    const last = n === count - 1

    out.push(
      cx + rx * ax * cos - ry * ay * sin,
      cy + rx * ax * sin + ry * ay * cos,
      cx + rx * bx * cos - ry * by * sin,
      cy + rx * bx * sin + ry * by * cos,
      // Snap the final point to avoid floating-point drift.
      last ? x2 : cx + rx * cos2 * cos - ry * sin2 * sin,
      last ? y2 : cy + rx * cos2 * sin + ry * sin2 * cos,
    )

    cos1 = cos2
    sin1 = sin2
  }
}
