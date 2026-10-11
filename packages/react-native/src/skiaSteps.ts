import { type MorphOptions, prepare } from '@morphfx/core'
import type { Skia, SkPath } from '@shopify/react-native-skia'
import { frame, toFrameData } from './frame'

type SkiaApi = typeof Skia

/** One step of a morph as two Skia paths with identical structure. */
export interface SkiaStep {
  from: SkPath
  to: SkPath
}

/**
 * Builds structurally identical Skia paths for each step through `paths`, so
 * that Skia can interpolate them natively (`to.interpolate(from, t)`).
 */
export function skiaSteps(
  skia: SkiaApi,
  paths: readonly string[],
  options?: MorphOptions,
): SkiaStep[] {
  if (paths.length === 0) throw new TypeError('useMorphPath needs at least one shape')
  const shapes = paths.length === 1 ? [paths[0], paths[0]] : paths
  const steps: SkiaStep[] = []
  for (let i = 0; i < shapes.length - 1; i++) {
    const data = toFrameData(prepare(shapes[i], shapes[i + 1], options), 4)
    const from = skia.Path.MakeFromSVGString(frame(data, 0))
    const to = skia.Path.MakeFromSVGString(frame(data, 1))
    if (!from || !to?.isInterpolatable(from)) {
      throw new Error('Skia could not interpolate the prepared paths')
    }
    steps.push({ from, to })
  }
  return steps
}
