import { type MorphOptions, morph } from '@morphfx/core'
import { useMemo } from 'react'

/**
 * Returns an interpolator through `paths` (`t = 0` gives the first path,
 * `t = 1` the last), recomputed only when the paths or options change.
 * Use it with any animation library, for example Motion's `useTransform`.
 *
 * @example
 * const mix = useMorph([play, pause])
 * const d = useTransform(progress, mix)
 */
export function useMorph(paths: readonly string[], options?: MorphOptions): (t: number) => string {
  // Compare by value: callers usually pass a new array on every render.
  const key = JSON.stringify([paths, options ?? null])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` covers `paths` and `options`.
  return useMemo(() => morph(paths, options), [key])
}
