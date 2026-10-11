import { type InterpolateOptions, interpolate } from './interpolate'
import { normalize } from './normalize'
import { type PathInput, type PrepareOptions, prepare } from './prepare'
import { serialize } from './serialize'

export type MorphOptions = PrepareOptions & InterpolateOptions

/**
 * Creates an interpolator between two shapes: `t = 0` gives `from`, `t = 1`
 * gives `to`, and values in between give the in-between shapes.
 *
 * @example
 * const mix = morph(playIcon, pauseIcon)
 * path.setAttribute('d', mix(0.5))
 */
export function morph(from: PathInput, to: PathInput, options?: MorphOptions): (t: number) => string
/**
 * Creates an interpolator through several shapes, evenly spread over
 * `t ∈ [0, 1]`: with three shapes, `t = 0.5` gives the second one.
 */
export function morph(paths: readonly PathInput[], options?: MorphOptions): (t: number) => string
export function morph(
  first: PathInput | readonly PathInput[],
  second?: PathInput | MorphOptions,
  third?: MorphOptions,
): (t: number) => string {
  if (typeof second === 'string' || Array.isArray(second)) {
    return interpolate(prepare(first as PathInput, second, third), third)
  }
  return keyframes(first as readonly PathInput[], second as MorphOptions | undefined)
}

function keyframes(paths: readonly PathInput[], options: MorphOptions = {}): (t: number) => string {
  if (paths.length === 0) throw new TypeError('morph() needs at least one shape')
  const shapes = paths.map((path) => (typeof path === 'string' ? normalize(path) : path))
  if (shapes.length === 1) {
    const d = serialize(shapes[0], options)
    return () => d
  }

  const steps: ((t: number) => string)[] = []
  for (let i = 0; i < shapes.length - 1; i++) {
    steps.push(interpolate(prepare(shapes[i], shapes[i + 1], options), options))
  }
  const last = steps.length - 1
  return (t: number): string => {
    const scaled = t * steps.length
    const index = Math.min(Math.max(Math.floor(scaled), 0), last)
    return steps[index](scaled - index)
  }
}

/**
 * A path mixer for Motion's `useTransform` and `transform`:
 *
 * ```ts
 * const d = useTransform(progress, [0, 1], [circle, star], { mixer })
 * ```
 */
export function mixer(from: string, to: string): (t: number) => string {
  return morph(from, to)
}
