import {
  DEFAULT_TRANSITION,
  EASING_CURVES,
  type Easing as MorphEasing,
  springPhysics,
  type Transition,
} from '@morphfx/core/animate'
import {
  type AnimationCallback,
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  ReduceMotion,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

/**
 * When to skip animations:
 * - `'user'`: when the operating system asks for reduced motion (default);
 * - `'always'`: never animate, change shapes instantly;
 * - `'never'`: always animate.
 */
export type ReducedMotion = 'user' | 'always' | 'never'

const REDUCE_MOTION: Record<ReducedMotion, ReduceMotion> = {
  user: ReduceMotion.System,
  always: ReduceMotion.Always,
  never: ReduceMotion.Never,
}

/**
 * Builds the Reanimated animation that moves a progress value to `goal`,
 * reproducing a morphfx `Transition`. Springs use the same physics as on the
 * web; an interrupted spring keeps its velocity.
 */
export function animateTo(
  goal: number,
  transition: Transition = DEFAULT_TRANSITION,
  reducedMotion: ReducedMotion = 'user',
  callback?: AnimationCallback,
): number {
  const reduceMotion = REDUCE_MOTION[reducedMotion]
  const animation =
    transition.type === 'spring'
      ? withSpring(goal, { ...springPhysics(transition), reduceMotion }, callback)
      : withTiming(
          goal,
          {
            duration: Math.max(0, transition.duration ?? 0.3) * 1000,
            easing: toReanimatedEasing(transition.ease ?? 'easeOut'),
            reduceMotion,
          },
          callback,
        )
  const delay = Math.max(0, transition.delay ?? 0) * 1000
  return delay > 0 ? withDelay(delay, animation, reduceMotion) : animation
}

/** Custom easing functions must be worklets (add a `'worklet'` directive). */
function toReanimatedEasing(ease: MorphEasing): EasingFunction | EasingFunctionFactory {
  if (ease === 'linear') return Easing.linear
  if (typeof ease === 'function') return ease
  const [x1, y1, x2, y2] = typeof ease === 'string' ? EASING_CURVES[ease] : ease
  return Easing.bezier(x1, y1, x2, y2)
}
