import { DEFAULT_PRECISION, formatNumber } from './format'
import type { CubicPath } from './normalize'

export interface SerializeOptions {
  /**
   * Maximum number of decimals written for each coordinate.
   * Lower values give shorter strings and faster per-frame updates.
   * @default 3
   */
  precision?: number
}

/**
 * Writes a cubic path back to SVG path data, e.g. `M0 0C1 2 3 4 5 6Z`.
 * Numbers are rounded to `precision` decimals with trailing zeros removed.
 */
export function serialize(path: CubicPath, options: SerializeOptions = {}): string {
  const factor = 10 ** (options.precision ?? DEFAULT_PRECISION)
  let d = ''

  for (const { points, closed } of path) {
    d += `M${formatNumber(points[0], factor)} ${formatNumber(points[1], factor)}`
    if (points.length > 2) d += 'C'
    for (let i = 2; i < points.length; i++) {
      d += `${i > 2 ? ' ' : ''}${formatNumber(points[i], factor)}`
    }
    if (closed) d += 'Z'
  }

  return d
}
