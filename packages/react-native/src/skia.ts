import type { MorphOptions } from '@morphfx/core'
import { Skia, type SkPath } from '@shopify/react-native-skia'
import { useMemo } from 'react'
import { type SharedValue, useAnimatedReaction, useSharedValue } from 'react-native-reanimated'
import { skiaSteps } from './skiaSteps'

/**
 * A Skia path that follows `progress` through `paths` (`progress` 0 shows the
 * first, 1 the last), for `<Path path={…} />` inside a Skia `<Canvas>`.
 * Shapes are matched once; each frame is a native Skia path interpolation
 * on the UI thread.
 *
 * @example
 * const progress = useSharedValue(0)
 * const path = useMorphPath([circle, star], progress)
 * <Canvas style={{ flex: 1 }}>
 *   <Path path={path} color="tomato" />
 * </Canvas>
 */
export function useMorphPath(
  paths: readonly string[],
  progress: SharedValue<number> | number,
  options?: MorphOptions,
): SharedValue<SkPath> {
  // Compare by value: callers usually pass a new array on every render.
  const key = JSON.stringify([paths, options ?? null])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` covers `paths` and `options`.
  const steps = useMemo(() => skiaSteps(Skia, paths, options), [key])
  const path = useSharedValue(steps[0].from)

  useAnimatedReaction(
    () => {
      'worklet'
      return typeof progress === 'number' ? progress : progress.value
    },
    (t) => {
      'worklet'
      const scaled = t * steps.length
      const index = Math.min(Math.max(Math.floor(scaled), 0), steps.length - 1)
      const step = steps[index]
      // `interpolate` weighs `to` by the progress and `from` by the rest.
      path.value = step.to.interpolate(step.from, scaled - index) ?? step.to
    },
    [steps, progress],
  )

  return path
}
