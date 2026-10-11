import { type MorphOptions, morph } from '@morphfx/core'
import type { Transition } from '@morphfx/core/animate'
import {
  type ComponentPropsWithoutRef,
  type ReactElement,
  type Ref,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type Playback, play } from './playback'
import { useMorph } from './useMorph'

/**
 * When to skip animations:
 * - `'user'`: when the operating system asks for reduced motion (default);
 * - `'always'`: never animate, change shapes instantly;
 * - `'never'`: always animate.
 */
export type ReducedMotion = 'user' | 'always' | 'never'

/** A progress value that changes over time, such as Motion's `MotionValue`. */
export interface ProgressValue {
  get(): number
  on(event: 'change', callback: (value: number) => void): () => void
}

type PathAttributes = Omit<ComponentPropsWithoutRef<'path'>, 'd'>

interface CommonProps extends PathAttributes {
  ref?: Ref<SVGPathElement>
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

/** Shows the shape at `progress` through `paths`, for scroll- or gesture-driven morphs. */
export interface ControlledMorphPathProps extends CommonProps {
  /** Shapes to morph through: `progress` 0 shows the first, 1 the last. */
  paths: readonly string[]
  /** A number, or a value that changes over time such as a Motion `MotionValue`. */
  progress: number | ProgressValue
  d?: never
  transition?: never
  reducedMotion?: never
  onMorphStart?: never
  onMorphComplete?: never
}

export type MorphPathProps = AnimatedMorphPathProps | ControlledMorphPathProps

/**
 * An SVG `<path>` that morphs between shapes. Every other prop is passed to
 * the `<path>`. Frames are written straight to the DOM: React does not
 * re-render while a morph plays.
 *
 * @example
 * <svg viewBox="0 0 24 24">
 *   <MorphPath d={playing ? pause : play} fill="currentColor" />
 * </svg>
 */
export function MorphPath(props: MorphPathProps): ReactElement {
  return props.paths !== undefined ? (
    <ControlledPath {...props} />
  ) : (
    <AnimatedPath {...(props as AnimatedMorphPathProps)} />
  )
}

/** What an animated path is showing and where its current morph stands. */
interface MorphState {
  /** Path data currently in the DOM. */
  shown: string
  /** The last `d` requested. */
  target: string
  /** The current morph, from `from` (progress 0) to `to` (progress 1). */
  mix: ((t: number) => string) | undefined
  from: string
  to: string
  progress: number
  playback: Playback | undefined
}

function AnimatedPath({
  d,
  transition,
  reducedMotion = 'user',
  onMorphStart,
  onMorphComplete,
  options,
  ref,
  ...attributes
}: AnimatedMorphPathProps): ReactElement {
  // React renders the first shape only (on the server too); later shapes are
  // written by the animation, so React never resets `d` mid-morph.
  const [initial] = useState(d)
  const element = useRef<SVGPathElement | null>(null)
  const state = useRef<MorphState>({
    shown: initial,
    target: initial,
    mix: undefined,
    from: initial,
    to: initial,
    progress: 1,
    playback: undefined,
  })
  const settings = useRef({ transition, reducedMotion, options, onMorphStart, onMorphComplete })
  useEffect(() => {
    settings.current = { transition, reducedMotion, options, onMorphStart, onMorphComplete }
  })

  useEffect(() => {
    const current = state.current
    const path = element.current
    if (d === current.target || path === null) return
    const { transition, reducedMotion, options, onMorphStart, onMorphComplete } = settings.current
    current.target = d

    let progress = current.progress
    let velocity = 0
    if (current.playback) {
      ;({ value: progress, velocity } = current.playback.stop())
      current.playback = undefined
    }
    const show = (value: string): void => {
      path.setAttribute('d', value)
      current.shown = value
    }
    const jump = (): void => {
      show(d)
      Object.assign(current, { mix: undefined, from: d, to: d, progress: 1 })
      onMorphStart?.()
      onMorphComplete?.()
    }

    if (shouldReduceMotion(reducedMotion)) return jump()

    // Going back or forward on the current morph keeps its momentum;
    // anything else starts a new morph from the shape on screen.
    let goal = 1
    if (current.mix !== undefined && d === current.to) goal = 1
    else if (current.mix !== undefined && d === current.from) goal = 0
    else {
      try {
        current.mix = morph(current.shown, d, options)
      } catch (error) {
        console.error(error)
        return jump()
      }
      Object.assign(current, { from: current.shown, to: d })
      progress = 0
      velocity = 0
    }

    const mix = current.mix
    onMorphStart?.()
    current.playback = play(
      transition,
      progress,
      goal,
      velocity,
      (value) => {
        current.progress = value
        show(mix(value))
      },
      () => {
        current.playback = undefined
        // End on the exact path data that was requested.
        show(goal === 1 ? current.to : current.from)
        onMorphComplete?.()
      },
    )
  }, [d])

  useEffect(() => () => void state.current.playback?.stop(), [])

  return <path {...attributes} ref={useMergedRef(element, ref)} d={initial} />
}

function ControlledPath({
  paths,
  progress,
  options,
  ref,
  ...attributes
}: ControlledMorphPathProps): ReactElement {
  const mix = useMorph(paths, options)
  const [initial] = useState(() => mix(typeof progress === 'number' ? progress : progress.get()))
  const element = useRef<SVGPathElement | null>(null)

  useEffect(() => {
    const path = element.current
    if (path === null) return
    if (typeof progress === 'number') {
      path.setAttribute('d', mix(progress))
      return
    }
    path.setAttribute('d', mix(progress.get()))
    return progress.on('change', (value) => path.setAttribute('d', mix(value)))
  }, [mix, progress])

  return <path {...attributes} ref={useMergedRef(element, ref)} d={initial} />
}

function useMergedRef<T>(
  own: { current: T | null },
  forwarded: Ref<T> | undefined,
): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      own.current = node
      if (typeof forwarded === 'function') forwarded(node)
      else if (forwarded) forwarded.current = node
    },
    [own, forwarded],
  )
}

function shouldReduceMotion(setting: ReducedMotion): boolean {
  if (setting !== 'user') return setting === 'always'
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
