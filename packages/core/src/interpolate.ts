import { DEFAULT_PRECISION, formatNumber } from './format'
import type { PreparedMorph } from './prepare'

export interface InterpolateOptions {
  /**
   * Maximum number of decimals written for each coordinate.
   * Lower values give shorter strings and faster per-frame updates.
   * @default 3
   */
  precision?: number
}

/**
 * Turns a prepared morph into an interpolator: a function from progress `t`
 * to path data. `t = 0` gives the source shape and `t = 1` the target shape.
 * Values outside `[0, 1]` extrapolate, which suits overshooting springs.
 *
 * This is the per-frame part of a morph: a single loop over the points.
 */
export function interpolate(
  prepared: PreparedMorph,
  options: InterpolateOptions = {},
): (t: number) => string {
  const { layout, from, to } = prepared
  const factor = 10 ** (options.precision ?? DEFAULT_PRECISION)
  const delta = new Array<number>(from.length)
  for (let i = 0; i < from.length; i++) delta[i] = to[i] - from[i]

  return (t: number): string => {
    let d = ''
    let start = 0
    for (let s = 0; s < layout.length; s += 2) {
      const end = start + 2 + 6 * layout[s]
      d += `M${formatNumber(from[start] + delta[start] * t, factor)} ${formatNumber(from[start + 1] + delta[start + 1] * t, factor)}C`
      for (let i = start + 2; i < end; i++) {
        d += `${i > start + 2 ? ' ' : ''}${formatNumber(from[i] + delta[i] * t, factor)}`
      }
      if (layout[s + 1] === 1) d += 'Z'
      start = end
    }
    return d
  }
}
