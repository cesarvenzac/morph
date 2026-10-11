import { createTransition, type Transition } from '@morphfx/core/animate'

export interface Playback {
  /** Stops the animation and returns where it was. */
  stop(): { value: number; velocity: number }
}

/**
 * Animates a value from `from` to `to` on every animation frame, calling
 * `onFrame` with each new value and `onComplete` once it settles.
 */
export function play(
  transition: Transition | undefined,
  from: number,
  to: number,
  velocity: number,
  onFrame: (value: number) => void,
  onComplete: () => void,
): Playback {
  const step = createTransition(transition, { from, to, velocity })
  const start = performance.now()
  let state = { value: from, velocity }

  const tick = (now: number): void => {
    const next = step(Math.max(0, now - start) / 1000)
    state = next
    onFrame(next.value)
    if (next.done) onComplete()
    else frame = requestAnimationFrame(tick)
  }
  let frame = requestAnimationFrame(tick)

  return {
    stop() {
      cancelAnimationFrame(frame)
      return state
    },
  }
}
