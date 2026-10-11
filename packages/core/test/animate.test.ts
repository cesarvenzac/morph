import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createTransition,
  cubicBezier,
  DEFAULT_TRANSITION,
  EASING_CURVES,
  easingFunction,
  springPhysics,
  type Transition,
  type TransitionState,
} from '../src/animate'

/** Runs a transition at 60 fps until it is done (or `limit` seconds pass). */
function run(step: (elapsed: number) => TransitionState, limit = 20): TransitionState[] {
  const states: TransitionState[] = []
  for (let elapsed = 0; elapsed <= limit; elapsed += 1 / 60) {
    const state = step(elapsed)
    states.push(state)
    if (state.done) break
  }
  return states
}

describe('easing', () => {
  it('provides named curves', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      const ease = easingFunction(name)
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
    }
    expect(easingFunction('easeInOut')(0.5)).toBeCloseTo(0.5, 5)
    expect(easingFunction('easeIn')(0.25)).toBeLessThan(0.25)
    expect(easingFunction('easeOut')(0.25)).toBeGreaterThan(0.25)
  })

  it('accepts custom functions', () => {
    const square = (t: number): number => t * t
    expect(easingFunction(square)).toBe(square)
  })

  it('rejects unknown names', () => {
    expect(() => easingFunction('wobbly' as 'linear')).toThrow(TypeError)
  })

  it('matches cubic-bezier definitions', () => {
    // CSS `ease` is cubic-bezier(0.25, 0.1, 0.25, 1): at x = 0.5, y ≈ 0.8024.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3)
    expect(cubicBezier(0.5, 0.5, 0.5, 0.5)(0.3)).toBe(0.3)
  })

  it('is monotonic for monotonic curves', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x1, y1, x2, y2) => {
          const ease = cubicBezier(x1, y1, x2, y2)
          let previous = 0
          for (let t = 0; t <= 1; t += 0.05) {
            const value = ease(t)
            expect(value).toBeGreaterThanOrEqual(previous - 1e-6)
            previous = value
          }
        },
      ),
    )
  })
})

describe('tween', () => {
  it('moves from `from` to `to` over its duration', () => {
    const step = createTransition(
      { type: 'tween', duration: 0.5, ease: 'linear' },
      { from: 2, to: 4 },
    )
    expect(step(0)).toEqual({ value: 2, velocity: expect.closeTo(4, 3), done: false })
    expect(step(0.25).value).toBeCloseTo(3, 9)
    expect(step(0.5)).toEqual({ value: 4, velocity: 0, done: true })
    expect(step(10).value).toBe(4)
  })

  it('applies easing', () => {
    const step = createTransition({ type: 'tween', duration: 1, ease: 'easeIn' })
    expect(step(0.5).value).toBeCloseTo(easingFunction('easeIn')(0.5), 9)
  })

  it('waits for its delay', () => {
    const step = createTransition({ type: 'tween', duration: 1, delay: 0.5, ease: 'linear' })
    expect(step(0.25)).toEqual({ value: 0, velocity: 0, done: false })
    expect(step(1).value).toBeCloseTo(0.5, 9)
  })

  it('finishes immediately without a duration', () => {
    expect(createTransition({ type: 'tween', duration: 0 })(0)).toEqual({
      value: 1,
      velocity: 0,
      done: true,
    })
  })
})

describe('spring', () => {
  it('is the default transition', () => {
    expect(DEFAULT_TRANSITION.type).toBe('spring')
    const states = run(createTransition())
    expect(states.at(-1)).toEqual({ value: 1, velocity: 0, done: true })
  })

  it('settles in about its duration without bounce', () => {
    const step = createTransition({ type: 'spring', duration: 0.4, bounce: 0 })
    expect(step(0.4).value).toBeGreaterThan(0.95)
    const states = run(step)
    expect(states.length / 60).toBeLessThan(1)
    expect(Math.max(...states.map((s) => s.value))).toBeLessThanOrEqual(1)
  })

  it('overshoots with bounce', () => {
    const states = run(createTransition({ type: 'spring', duration: 0.4, bounce: 0.5 }))
    expect(Math.max(...states.map((s) => s.value))).toBeGreaterThan(1.05)
    expect(states.at(-1)?.value).toBe(1)
  })

  it('treats negative bounce as no bounce', () => {
    const none = createTransition({ type: 'spring', bounce: 0 })
    const negative = createTransition({ type: 'spring', bounce: -0.5 })
    expect(negative(0.2)).toEqual(none(0.2))
  })

  it('starts with the given velocity and keeps momentum', () => {
    // Reversing mid-flight: moving up at 3 units/s, now targeting 0.
    const step = createTransition({ type: 'spring' }, { from: 0.6, to: 0, velocity: 3 })
    expect(step(0).velocity).toBeCloseTo(3, 9)
    expect(step(0.02).value).toBeGreaterThan(0.6)
    expect(run(step).at(-1)?.value).toBe(0)
  })

  it('accepts physical parameters', () => {
    const transition: Transition = { type: 'spring', stiffness: 100, damping: 10, mass: 1 }
    const states = run(createTransition(transition))
    expect(states.at(-1)?.done).toBe(true)
    // Underdamped (ζ = 0.5): it overshoots.
    expect(Math.max(...states.map((s) => s.value))).toBeGreaterThan(1)
  })

  it('reports velocity consistent with position', () => {
    for (const transition of [
      { type: 'spring', bounce: 0 },
      { type: 'spring', bounce: 0.3 },
      { type: 'spring', stiffness: 100, damping: 40 },
    ] as const) {
      const step = createTransition(transition, { velocity: 2 })
      const t = 0.1
      const h = 1e-6
      const numerical = (step(t + h).value - step(t - h).value) / (2 * h)
      expect(step(t).velocity).toBeCloseTo(numerical, 3)
    }
  })

  it('always comes to rest on the target', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        (duration, bounce, from, to, velocity) => {
          const states = run(
            createTransition({ type: 'spring', duration, bounce }, { from, to, velocity }),
            120,
          )
          const last = states.at(-1)
          expect(last?.done).toBe(true)
          expect(last?.value).toBe(to)
          expect(states.every((s) => Number.isFinite(s.value) && Number.isFinite(s.velocity))).toBe(
            true,
          )
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('springPhysics', () => {
  it('derives stiffness and damping from duration and bounce', () => {
    const { stiffness, damping, mass } = springPhysics({ type: 'spring', duration: 0.5, bounce: 0 })
    expect(mass).toBe(1)
    expect(stiffness).toBeCloseTo(((2 * Math.PI) / 0.5) ** 2, 9)
    // No bounce: critically damped.
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness), 9)
  })

  it('keeps physical parameters as given', () => {
    expect(springPhysics({ type: 'spring', stiffness: 120, damping: 14, mass: 2 })).toEqual({
      stiffness: 120,
      damping: 14,
      mass: 2,
    })
  })

  it('exposes the named easing curves', () => {
    expect(EASING_CURVES.easeInOut).toEqual([0.42, 0, 0.58, 1])
  })
})
