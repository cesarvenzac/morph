import { morph, normalize } from '@morphfx/core'
import { act, render } from '@testing-library/react'
import { createRef, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MorphPath, type ProgressValue } from '../src'

const square = 'M10 10 H90 V90 H10 Z'
const circle = 'M50 10 A40 40 0 1 1 50 90 A40 40 0 1 1 50 10 Z'
const triangle = 'M50 10 L90 85 H10 Z'
const linear = { type: 'tween', duration: 1, ease: 'linear' } as const

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'setTimeout',
      'clearTimeout',
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(ui: ReactNode) {
  const result = render(<svg>{ui}</svg>)
  return {
    ...result,
    d: () => result.container.querySelector('path')?.getAttribute('d') ?? null,
    update: (next: ReactNode) => result.rerender(<svg>{next}</svg>),
  }
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Largest coordinate difference between two paths with the same structure. */
function difference(a: string | null, b: string | null): number {
  const pa = normalize(a ?? '')
  const pb = normalize(b ?? '')
  expect(pa.length).toBe(pb.length)
  let max = 0
  pa.forEach((subpath, i) => {
    subpath.points.forEach((value, j) => {
      max = Math.max(max, Math.abs(value - pb[i].points[j]))
    })
  })
  return max
}

describe('MorphPath', () => {
  it('renders a path with the given shape and attributes', () => {
    const { container, d } = setup(
      <MorphPath d={square} fill="tomato" className="icon" data-testid="shape" aria-hidden />,
    )
    const path = container.querySelector('path')
    expect(d()).toBe(square)
    expect(path?.getAttribute('fill')).toBe('tomato')
    expect(path?.getAttribute('class')).toBe('icon')
    expect(path?.getAttribute('data-testid')).toBe('shape')
    expect(path?.getAttribute('aria-hidden')).toBe('true')
  })

  it('animates to a new shape and ends on its exact path data', () => {
    const onMorphStart = vi.fn()
    const onMorphComplete = vi.fn()
    const props = { onMorphStart, onMorphComplete }
    const { d, update } = setup(<MorphPath d={square} {...props} />)

    update(<MorphPath d={circle} {...props} />)
    expect(onMorphStart).toHaveBeenCalledTimes(1)
    expect(d()).toBe(square)

    advance(100)
    expect(d()).not.toBe(square)
    expect(d()).not.toBe(circle)
    expect(onMorphComplete).not.toHaveBeenCalled()

    advance(2000)
    expect(d()).toBe(circle)
    expect(onMorphComplete).toHaveBeenCalledTimes(1)
  })

  it('follows the transition', () => {
    const { d, update } = setup(<MorphPath d={square} transition={linear} />)
    update(<MorphPath d={circle} transition={linear} />)
    advance(500)
    // Halfway through a linear one-second tween (within a frame).
    const mix = morph(square, circle)
    expect(difference(d(), mix(0.5))).toBeLessThan(2)
    advance(450)
    expect(d()).not.toBe(circle)
    advance(100)
    expect(d()).toBe(circle)
  })

  it('reverses smoothly when going back mid-morph', () => {
    const onMorphComplete = vi.fn()
    const { d, update } = setup(
      <MorphPath d={square} transition={linear} onMorphComplete={onMorphComplete} />,
    )
    update(<MorphPath d={circle} transition={linear} onMorphComplete={onMorphComplete} />)
    advance(500)
    const before = d()

    update(<MorphPath d={square} transition={linear} onMorphComplete={onMorphComplete} />)
    advance(16)
    // No jump: one frame later, the shape is still close to where it was.
    expect(difference(d(), before)).toBeLessThan(2)

    advance(1000)
    expect(d()).toBe(square)
    expect(onMorphComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps momentum when a spring is reversed', () => {
    const { d, update } = setup(
      <MorphPath d={square} transition={{ type: 'spring', duration: 1 }} />,
    )
    update(<MorphPath d={circle} transition={{ type: 'spring', duration: 1 }} />)
    advance(150)
    const mix = morph(square, circle)
    const progressOf = (value: string | null): number => {
      // Find the progress whose frame is closest to `value`.
      let best = 0
      let error = Number.POSITIVE_INFINITY
      for (let t = 0; t <= 1; t += 0.001) {
        const e = difference(value, mix(t))
        if (e < error) {
          error = e
          best = t
        }
      }
      return best
    }
    const before = progressOf(d())

    update(<MorphPath d={square} transition={{ type: 'spring', duration: 1 }} />)
    advance(32)
    // Still moving towards the circle for a moment before turning back.
    expect(progressOf(d())).toBeGreaterThan(before)
    advance(3000)
    expect(d()).toBe(square)
  })

  it('morphs from the current shape to a new target mid-morph', () => {
    const { d, update } = setup(<MorphPath d={square} transition={linear} />)
    update(<MorphPath d={circle} transition={linear} />)
    advance(400)
    const before = d()

    update(<MorphPath d={triangle} transition={linear} />)
    advance(16)
    // The new morph starts from the shape that was on screen: no jump.
    expect(difference(d(), morph(before ?? '', triangle)(0))).toBeLessThan(2)
    advance(1100)
    expect(d()).toBe(triangle)
  })

  it('does not animate when re-rendered with the same shape', () => {
    const onMorphStart = vi.fn()
    const { update } = setup(<MorphPath d={square} onMorphStart={onMorphStart} />)
    update(<MorphPath d={square} onMorphStart={onMorphStart} fill="red" />)
    expect(onMorphStart).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  describe('reduced motion', () => {
    it('changes shape instantly with reducedMotion="always"', () => {
      const onMorphComplete = vi.fn()
      const { d, update } = setup(<MorphPath d={square} reducedMotion="always" />)
      update(<MorphPath d={circle} reducedMotion="always" onMorphComplete={onMorphComplete} />)
      expect(d()).toBe(circle)
      expect(onMorphComplete).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('follows the operating system setting by default', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
      const { d, update } = setup(<MorphPath d={square} />)
      update(<MorphPath d={circle} />)
      expect(d()).toBe(circle)
      vi.unstubAllGlobals()
    })

    it('animates anyway with reducedMotion="never"', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }))
      const { d, update } = setup(<MorphPath d={square} reducedMotion="never" />)
      update(<MorphPath d={circle} reducedMotion="never" />)
      expect(d()).toBe(square)
      advance(2000)
      expect(d()).toBe(circle)
      vi.unstubAllGlobals()
    })
  })

  it('shows invalid path data without animating, and reports it', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d, update } = setup(<MorphPath d={square} />)
    update(<MorphPath d="M10 10 L" />)
    expect(d()).toBe('M10 10 L')
    expect(error).toHaveBeenCalledOnce()
  })

  it('stops animating when unmounted', () => {
    const { update, unmount } = setup(<MorphPath d={square} />)
    update(<MorphPath d={circle} />)
    advance(50)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('works in StrictMode', () => {
    const onMorphComplete = vi.fn()
    const result = render(
      <StrictMode>
        <svg>
          <MorphPath d={square} onMorphComplete={onMorphComplete} />
        </svg>
      </StrictMode>,
    )
    result.rerender(
      <StrictMode>
        <svg>
          <MorphPath d={circle} onMorphComplete={onMorphComplete} />
        </svg>
      </StrictMode>,
    )
    advance(2000)
    expect(result.container.querySelector('path')?.getAttribute('d')).toBe(circle)
    expect(onMorphComplete).toHaveBeenCalledTimes(1)
  })

  it('forwards refs', () => {
    const object = createRef<SVGPathElement>()
    const callback = vi.fn()
    const { container } = render(
      <svg>
        <MorphPath d={square} ref={object} />
        <MorphPath d={circle} ref={callback} />
      </svg>,
    )
    const [first, second] = container.querySelectorAll('path')
    expect(object.current).toBe(first)
    expect(callback).toHaveBeenCalledWith(second)
  })

  describe('controlled by progress', () => {
    it('shows the shape at a numeric progress', () => {
      const mix = morph([square, circle, triangle])
      const { d, update } = setup(<MorphPath paths={[square, circle, triangle]} progress={0} />)
      expect(d()).toBe(mix(0))
      update(<MorphPath paths={[square, circle, triangle]} progress={0.25} />)
      expect(d()).toBe(mix(0.25))
      update(<MorphPath paths={[square, circle, triangle]} progress={1} />)
      expect(d()).toBe(mix(1))
      expect(vi.getTimerCount()).toBe(0)
    })

    it('follows a progress value without re-rendering', () => {
      const listeners = new Set<(value: number) => void>()
      let current = 0.5
      const progress: ProgressValue = {
        get: () => current,
        on: (_, callback) => {
          listeners.add(callback)
          return () => listeners.delete(callback)
        },
      }
      const set = (value: number): void => {
        current = value
        for (const listener of listeners) listener(value)
      }

      const mix = morph([square, circle])
      const { d, unmount } = setup(<MorphPath paths={[square, circle]} progress={progress} />)
      expect(d()).toBe(mix(0.5))
      set(0.8)
      expect(d()).toBe(mix(0.8))
      expect(listeners.size).toBe(1)
      unmount()
      expect(listeners.size).toBe(0)
    })

    it('passes morph options through', () => {
      const { d } = setup(
        <MorphPath paths={[square, circle]} progress={0.5} options={{ precision: 0 }} />,
      )
      expect(d()).toBe(morph([square, circle], { precision: 0 })(0.5))
      expect(d()).not.toMatch(/\./)
    })
  })
})
