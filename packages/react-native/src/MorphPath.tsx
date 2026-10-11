import { interpolate, type MorphOptions, prepare } from '@morphfx/core'
import type { Transition } from '@morphfx/core/animate'
import { type ReactElement, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated'
import { Path, type PathProps } from 'react-native-svg'
import { frame, frameAt, keyframeData, toFrameData } from './frame'
import { animateTo, type ReducedMotion } from './transition'

const AnimatedPath = Animated.createAnimatedComponent(Path)

type PathAttributes = Omit<PathProps, 'd'>

interface CommonProps extends PathAttributes {
  ref?: Ref<Path>
  /** How shapes are matched and written. See `MorphOptions` in `@morphfx/core`. */
  options?: MorphOptions
}

/** Animates to `d` whenever it changes. */
export interface AnimatedMorphPathProps extends CommonProps {
  /** The shape to show. Changing it animates from the current shape. */
  d: string
  /** How the morph moves. @default { type: 'spring', duration: 0.4, bounce: 0 } */
  transition?: Transition
  /** @default 'user' */
  reducedMotion?: ReducedMotion
  /** Called when a morph starts. */
  onMorphStart?: () => void
  /** Called when a morph finishes (not when it is interrupted). */
  onMorphComplete?: () => void
  paths?: never
  progress?: never
}

/** Shows the shape at `progress` through `paths`, for gesture- or scroll-driven morphs. */
export interface ControlledMorphPathProps extends CommonProps {
  /** Shapes to morph through: `progress` 0 shows the first, 1 the last. */
  paths: readonly string[]
  /** A Reanimated shared value (updated on the UI thread, without re-rendering) or a number. */
  progress: SharedValue<number> | number
  d?: never
  transition?: never
  reducedMotion?: never
  onMorphStart?: never
  onMorphComplete?: never
}

export type MorphPathProps = AnimatedMorphPathProps | ControlledMorphPathProps

/**
 * A `react-native-svg` `<Path>` that morphs between shapes on the UI thread.
 * Every other prop is passed to the `<Path>`.
 *
 * @example
 * <Svg viewBox="0 0 24 24">
 *   <MorphPath d={playing ? pause : play} fill="black" />
 * </Svg>
 */
export function MorphPath(props: MorphPathProps): ReactElement {
  return props.paths !== undefined ? (
    <ControlledPath {...props} />
  ) : (
    <AnimatedMorph {...(props as AnimatedMorphPathProps)} />
  )
}

/** The current morph, as seen from the JS thread. */
interface MorphState {
  /** The last `d` requested. */
  target: string
  /** The current morph goes from `from` (progress 0) to `to` (progress 1). */
  from: string
  to: string
  mix: ((t: number) => string) | undefined
}

function AnimatedMorph({
  d,
  transition,
  reducedMotion = 'user',
  onMorphStart,
  onMorphComplete,
  options,
  ...attributes
}: AnimatedMorphPathProps): ReactElement {
  const [initial] = useState(d)
  const progress = useSharedValue(1)
  // Exact path data to show when no morph is playing, or null while one is.
  const exact = useSharedValue<string | null>(initial)
  const data = useSharedValue(toFrameData(prepare(initial, initial)))
  const state = useRef<MorphState>({ target: initial, from: initial, to: initial, mix: undefined })
  const settings = useRef({ transition, reducedMotion, options, onMorphStart, onMorphComplete })
  useEffect(() => {
    settings.current = { transition, reducedMotion, options, onMorphStart, onMorphComplete }
  })

  useEffect(() => {
    const current = state.current
    if (d === current.target) return
    const { transition, reducedMotion, options, onMorphStart, onMorphComplete } = settings.current
    current.target = d

    // Going back or forward on the current morph keeps its momentum;
    // anything else starts a new morph from the shape on screen.
    let goal = 1
    if (current.mix !== undefined && d === current.to) goal = 1
    else if (current.mix !== undefined && d === current.from) goal = 0
    else {
      const shown = exact.value ?? current.mix?.(progress.value) ?? current.to
      try {
        const prepared = prepare(shown, d, options)
        current.mix = interpolate(prepared, options)
        data.value = toFrameData(prepared, options?.precision)
      } catch (error) {
        console.error(error)
        cancelAnimation(progress)
        Object.assign(current, { from: d, to: d, mix: undefined })
        exact.value = d
        onMorphStart?.()
        onMorphComplete?.()
        return
      }
      Object.assign(current, { from: shown, to: d })
      progress.value = 0
    }

    const complete = (): void => {
      // End on the exact path data that was requested.
      exact.value = goal === 1 ? current.to : current.from
      onMorphComplete?.()
    }
    exact.value = null
    onMorphStart?.()
    progress.value = animateTo(goal, transition, reducedMotion, (finished) => {
      'worklet'
      if (finished) runOnJS(complete)()
    })
  }, [d, data, exact, progress])

  useEffect(() => () => cancelAnimation(progress), [progress])

  const animatedProps = useAnimatedProps(() => {
    'worklet'
    const value = exact.value
    return { d: value !== null ? value : frame(data.value, progress.value) }
  })

  return <AnimatedPath {...attributes} d={initial} animatedProps={animatedProps} />
}

function ControlledPath({
  paths,
  progress,
  options,
  ...attributes
}: ControlledMorphPathProps): ReactElement {
  // Compare by value: callers usually pass a new array on every render.
  const key = JSON.stringify([paths, options ?? null])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` covers `paths` and `options`.
  const list = useMemo(() => keyframeData(paths, options), [key])
  const [initial] = useState(() =>
    frameAt(list, typeof progress === 'number' ? progress : progress.value),
  )

  const animatedProps = useAnimatedProps(() => {
    'worklet'
    return { d: frameAt(list, typeof progress === 'number' ? progress : progress.value) }
  }, [list, progress])

  return <AnimatedPath {...attributes} d={initial} animatedProps={animatedProps} />
}
