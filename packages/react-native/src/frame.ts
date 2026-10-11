import { type MorphOptions, type PreparedMorph, prepare } from '@morphfx/core'

// Everything here that runs every frame is a worklet: Reanimated runs it on
// the UI thread, so it must be self-contained and only use plain data.

/** The numbers needed to draw any frame of a morph; plain data, copied to the UI thread. */
export interface FrameData {
  /** Two numbers per subpath: segment count, then 1 if closed. */
  layout: number[]
  from: number[]
  /** `to - from`, for each number. */
  delta: number[]
  /** `10 ** precision`. */
  factor: number
}

export function toFrameData(prepared: PreparedMorph, precision = 3): FrameData {
  const delta = prepared.to.map((value, i) => value - prepared.from[i])
  return { layout: prepared.layout, from: prepared.from, delta, factor: 10 ** precision }
}

/** Frame data for each step through `paths`: one step per consecutive pair. */
export function keyframeData(paths: readonly string[], options?: MorphOptions): FrameData[] {
  if (paths.length === 0) throw new TypeError('MorphPath needs at least one shape in `paths`')
  const steps = paths.length === 1 ? [paths[0], paths[0]] : paths
  const list: FrameData[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    list.push(toFrameData(prepare(steps[i], steps[i + 1], options), options?.precision))
  }
  return list
}

// Worklets are compiled to constants, which are not hoisted: define each
// worklet before the worklets that call it.

/** Formats a coordinate: rounded, trailing zeros removed, never `-0`. */
function format(value: number, factor: number): string {
  'worklet'
  // `+ 0` turns -0 into 0.
  return String(Math.round(value * factor) / factor + 0)
}

/** Path data of a morph at progress `t` (same output as `interpolate()` in `@morphfx/core`). */
export function frame(data: FrameData, t: number): string {
  'worklet'
  const { layout, from, delta, factor } = data
  let d = ''
  let start = 0
  for (let s = 0; s < layout.length; s += 2) {
    const end = start + 2 + 6 * layout[s]
    d += `M${format(from[start] + delta[start] * t, factor)} ${format(from[start + 1] + delta[start + 1] * t, factor)}C`
    for (let i = start + 2; i < end; i++) {
      d += `${i > start + 2 ? ' ' : ''}${format(from[i] + delta[i] * t, factor)}`
    }
    if (layout[s + 1] === 1) d += 'Z'
    start = end
  }
  return d
}

/** Path data at progress `t` through keyframes, evenly spread over [0, 1]. */
export function frameAt(list: readonly FrameData[], t: number): string {
  'worklet'
  const scaled = t * list.length
  const index = Math.min(Math.max(Math.floor(scaled), 0), list.length - 1)
  return frame(list[index], scaled - index)
}
