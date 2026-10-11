// Timing math for animating a morph's progress: tweens with easing curves, and
// physical springs. Pure functions with no timers or platform APIs, so any
// frame loop (requestAnimationFrame, Reanimated, a test clock) can drive them.

/** A named easing curve, a cubic Bézier `[x1, y1, x2, y2]`, or a custom function. */
export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | readonly [number, number, number, number]
  | ((t: number) => number)

/** Moves at a set pace over a fixed duration. */
export interface TweenTransition {
  type: 'tween'
  /** Duration in seconds. @default 0.3 */
  duration?: number
  /** @default 'easeOut' */
  ease?: Easing
  /** Delay before starting, in seconds. @default 0 */
  delay?: number
}

/**
 * Follows a physical spring, which keeps its momentum when interrupted.
 * Configure it either by feel (`duration` and `bounce`) or physically
 * (`stiffness`, `damping`, `mass`); physical values take precedence.
 */
export interface SpringTransition {
  type: 'spring'
  /** Perceived duration in seconds. @default 0.4 */
  duration?: number
  /** From 0 (no bounce) to 1 (a lot of bounce). @default 0 */
  bounce?: number
  stiffness?: number
  damping?: number
  /** @default 1 */
  mass?: number
  /** Delay before starting, in seconds. @default 0 */
  delay?: number
  /** The spring stops when this close to the target (in progress units). @default 0.001 */
  restDelta?: number
  /** …and slower than this (in progress units per second). @default 0.01 */
  restSpeed?: number
}

export type Transition = TweenTransition | SpringTransition

/** Where an animated value is at a given time. */
export interface TransitionState {
  value: number
  /** Units per second. */
  velocity: number
  done: boolean
}

export interface TransitionOptions {
  /** @default 0 */
  from?: number
  /** @default 1 */
  to?: number
  /** Initial velocity, in units per second (springs only). @default 0 */
  velocity?: number
}

/** The transition used when none is given: a smooth spring without bounce. */
export const DEFAULT_TRANSITION: SpringTransition = { type: 'spring', duration: 0.4, bounce: 0 }

/**
 * Creates a function that tells where a value animated from `from` to `to`
 * is after `elapsed` seconds.
 *
 * @example
 * const step = createTransition({ type: 'spring', bounce: 0.2 })
 * step(0.1) // { value: 0.37, velocity: 4.1, done: false }
 */
export function createTransition(
  transition: Transition = DEFAULT_TRANSITION,
  options: TransitionOptions = {},
): (elapsed: number) => TransitionState {
  const from = options.from ?? 0
  const to = options.to ?? 1
  const velocity = options.velocity ?? 0
  const delay = Math.max(0, transition.delay ?? 0)
  const run =
    transition.type === 'spring'
      ? spring(transition, from, to, velocity)
      : tween(transition, from, to)

  return (elapsed: number): TransitionState =>
    elapsed < delay ? { value: from, velocity: 0, done: false } : run(elapsed - delay)
}

function tween(
  transition: TweenTransition,
  from: number,
  to: number,
): (elapsed: number) => TransitionState {
  const duration = Math.max(0, transition.duration ?? 0.3)
  const ease = easingFunction(transition.ease ?? 'easeOut')
  const delta = to - from
  return (elapsed) => {
    if (elapsed >= duration) return { value: to, velocity: 0, done: true }
    const progress = elapsed / duration
    const value = from + delta * ease(progress)
    // Numerical derivative: tweens rarely need an exact velocity.
    const h = Math.min(1e-3, 1 - progress)
    const velocity = h > 0 ? (delta * (ease(progress + h) - ease(progress))) / (h * duration) : 0
    return { value, velocity, done: false }
  }
}

function spring(
  transition: SpringTransition,
  from: number,
  to: number,
  initialVelocity: number,
): (elapsed: number) => TransitionState {
  const { stiffness, damping, mass } = springPhysics(transition)
  const restDelta = transition.restDelta ?? 0.001
  const restSpeed = transition.restSpeed ?? 0.01

  const omega = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  // Solve for the displacement from the target, x(t) = value(t) - to.
  const x0 = from - to
  const v0 = initialVelocity
  let position: (t: number) => [number, number]

  if (zeta < 1) {
    const decay = zeta * omega
    const frequency = omega * Math.sqrt(1 - zeta * zeta)
    const b = (v0 + decay * x0) / frequency
    position = (t) => {
      const envelope = Math.exp(-decay * t)
      const cos = Math.cos(frequency * t)
      const sin = Math.sin(frequency * t)
      return [
        envelope * (x0 * cos + b * sin),
        envelope * ((b * frequency - decay * x0) * cos - (decay * b + frequency * x0) * sin),
      ]
    }
  } else if (Math.abs(zeta - 1) < 1e-9) {
    const c = v0 + omega * x0
    position = (t) => {
      const envelope = Math.exp(-omega * t)
      return [envelope * (x0 + c * t), envelope * (c - omega * (x0 + c * t))]
    }
  } else {
    const root = omega * Math.sqrt(zeta * zeta - 1)
    const r1 = -zeta * omega + root
    const r2 = -zeta * omega - root
    const a = (v0 - r2 * x0) / (r1 - r2)
    const b = x0 - a
    position = (t) => {
      const e1 = Math.exp(r1 * t)
      const e2 = Math.exp(r2 * t)
      return [a * e1 + b * e2, a * r1 * e1 + b * r2 * e2]
    }
  }

  return (elapsed) => {
    const [x, v] = position(elapsed)
    if (Math.abs(x) <= restDelta && Math.abs(v) <= restSpeed)
      return { value: to, velocity: 0, done: true }
    return { value: to + x, velocity: v, done: false }
  }
}

/** Physical parameters of a spring. */
export interface SpringPhysics {
  stiffness: number
  damping: number
  mass: number
}

/**
 * The physical parameters of a spring transition, derived from `duration` and
 * `bounce` unless `stiffness` and `damping` are given. Lets other animation
 * engines (such as Reanimated's `withSpring`) reproduce the same motion.
 */
export function springPhysics(transition: SpringTransition): SpringPhysics {
  const mass = transition.mass ?? 1
  const duration = Math.max(1e-3, transition.duration ?? 0.4)
  // A bounce of exactly 1 would oscillate forever.
  const bounce = Math.min(0.99, Math.max(0, transition.bounce ?? 0))
  // By feel: the duration is the period of the undamped oscillation, and
  // bounce lowers the damping ratio from 1 (critical damping).
  const stiffness = transition.stiffness ?? ((2 * Math.PI) / duration) ** 2 * mass
  const damping = transition.damping ?? 2 * (1 - bounce) * Math.sqrt(stiffness * mass)
  return { stiffness, damping, mass }
}

/** Cubic Bézier control points of the named easings. */
export const EASING_CURVES: Readonly<
  Record<'easeIn' | 'easeOut' | 'easeInOut', readonly [number, number, number, number]>
> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
}

const NAMED_EASINGS: Readonly<Record<string, readonly [number, number, number, number]>> =
  EASING_CURVES

/** Turns an `Easing` into a function from linear progress to eased progress. */
export function easingFunction(easing: Easing): (t: number) => number {
  if (typeof easing === 'function') return easing
  if (easing === 'linear') return (t) => t
  const curve = typeof easing === 'string' ? NAMED_EASINGS[easing] : easing
  if (!curve) throw new TypeError(`Unknown easing: ${String(easing)}`)
  return cubicBezier(...curve)
}

/**
 * A CSS-style `cubic-bezier(x1, y1, x2, y2)` easing function.
 * `x1` and `x2` must be within [0, 1].
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  if (x1 === y1 && x2 === y2) return (t) => t

  const bezier = (t: number, p1: number, p2: number): number =>
    ((1 - 3 * p2 + 3 * p1) * t + (3 * p2 - 6 * p1)) * t * t + 3 * p1 * t
  const slope = (t: number, p1: number, p2: number): number =>
    3 * (1 - 3 * p2 + 3 * p1) * t * t + 2 * (3 * p2 - 6 * p1) * t + 3 * p1

  /** Finds the curve parameter whose x is `x`: Newton's method, then bisection. */
  const solve = (x: number): number => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const error = bezier(t, x1, x2) - x
      if (Math.abs(error) < 1e-7) return t
      const d = slope(t, x1, x2)
      if (Math.abs(d) < 1e-6) break
      t -= error / d
    }
    let low = 0
    let high = 1
    t = x
    for (let i = 0; i < 40 && high - low > 1e-7; i++) {
      if (bezier(t, x1, x2) < x) low = t
      else high = t
      t = (low + high) / 2
    }
    return t
  }

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : bezier(solve(t), y1, y2))
}
